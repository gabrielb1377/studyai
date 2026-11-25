"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Download,
  Image as ImageIcon,
  CheckCircle2,
  LayoutGrid,
  Loader2,
  Network,
  Plus,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DiagramCanvas } from "@/features/diagrams/components/DiagramCanvas";
import { DiagramInspector } from "@/features/diagrams/components/DiagramInspector";
import {
  DIAGRAM_LIMITS,
  normalizeDiagram,
} from "@/features/diagrams/limits";
import { parseMermaid } from "@/features/diagrams/parse/mermaid";
import {
  diagramFileStem,
  downloadBlob,
  exportDiagramPng,
  exportDiagramSvg,
  saveDiagramToLibrary,
} from "@/features/diagrams/export/service";
import { createConceptMapFromGraph, createDiagramFromTemplate } from "@/features/diagrams/templates";
import {
  diagramTypeLabels,
  diagramTypes,
  type DiagramDocument,
  type DiagramTheme,
  type DiagramType,
} from "@/features/diagrams/types";
import { KnowledgeStorage } from "@/features/semantic/KnowledgeStorage";
import { studioColorSchemes } from "../export/theme";
import type { DocumentSection, Slide, StudioDocument } from "../types";

export type StudioDiagramsPanelProps = {
  document: StudioDocument;
  docType: "document" | "presentation";
  sections: DocumentSection[];
  slides: Slide[];
  activeSectionId?: string;
  activeSlideId?: string;
  onSelectSection: (sectionId: string) => void;
  onSelectSlide: (slideId: string) => void;
  onUpdateSection: (sectionId: string, updates: Partial<DocumentSection>) => void;
  onUpdateSlide: (slideId: string, updates: Partial<Slide>) => void;
  onAddDiagramSection: () => void;
  studySubject?: string;
  studyTopic?: string;
};

type BusyState = "ai" | "svg" | "png" | "library" | "knowledge" | null;

function csrfToken() {
  if (typeof document === "undefined") return "";
  return (
    document.cookie
      .split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith("studyai_csrf="))
      ?.split("=")
      .slice(1)
      .join("=") ?? ""
  );
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

export function StudioDiagramsPanel({
  document,
  docType,
  sections,
  slides,
  activeSectionId,
  activeSlideId,
  onSelectSection,
  onSelectSlide,
  onUpdateSection,
  onUpdateSlide,
  onAddDiagramSection,
  studySubject,
  studyTopic,
}: StudioDiagramsPanelProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>();
  const [busy, setBusy] = useState<BusyState>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [aiTopic, setAiTopic] = useState("");
  const [proposal, setProposal] = useState<DiagramDocument | null>(null);
  const [proposalNote, setProposalNote] = useState<string | null>(null);
  const [mermaidText, setMermaidText] = useState("");
  const [showMermaid, setShowMermaid] = useState(false);
  const [scale, setScale] = useState("2");
  const [transparent, setTransparent] = useState(false);

  const theme = useMemo<DiagramTheme>(() => {
    const colors = studioColorSchemes[document.customization.colorScheme] ?? studioColorSchemes.default;
    return {
      accent: colors.accent,
      accentSoft: colors.accentSoft,
      ink: colors.ink,
      muted: colors.muted,
      surface: colors.surface,
      border: colors.border,
      onAccent: colors.onAccent,
    };
  }, [document.customization.colorScheme]);

  const diagramSections = useMemo(
    () => sections.filter((section) => section.type === "diagram" || section.diagram),
    [sections],
  );
  const activeSection = sections.find((section) => section.id === activeSectionId);
  const activeSlide = slides.find((slide) => slide.id === activeSlideId);
  const targetId = docType === "presentation" ? activeSlide?.id : activeSection?.id;
  const storedDiagram = docType === "presentation" ? activeSlide?.diagram : activeSection?.diagram;
  const [draft, setDraft] = useState<{ targetId?: string; diagram: DiagramDocument } | null>(null);
  const diagram = draft && draft.targetId === targetId ? draft.diagram : storedDiagram;
  const targetLabel = docType === "presentation"
    ? `Slide ${(activeSlide?.order ?? 0) + 1}`
    : activeSection?.title || "Seção sem título";

  const clearMessages = () => {
    setError(null);
    setNotice(null);
  };

  // Agrupa edições rápidas (digitação, arrasto) em uma única gravação no
  // documento, evitando uma escrita no IndexedDB por caractere.
  const pendingRef = useRef<{ targetId: string; mode: "document" | "presentation"; diagram: DiagramDocument } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (!pending) return;
    if (pending.mode === "presentation") onUpdateSlide(pending.targetId, { diagram: pending.diagram });
    else onUpdateSection(pending.targetId, { diagram: pending.diagram });
  }, [onUpdateSection, onUpdateSlide]);

  const flushRef = useRef(flush);
  flushRef.current = flush;

  useEffect(() => () => flushRef.current(), []);

  useEffect(() => {
    // Troca de seção/slide: grava o que estava pendente antes de trocar.
    flushRef.current();
    setDraft(null);
  }, [targetId]);

  const applyDiagram = useCallback(
    (next: DiagramDocument) => {
      if (!targetId) return;
      if (docType === "document" && activeSection?.type !== "diagram") return;
      const normalized = normalizeDiagram(
        { ...next, updatedAt: new Date().toISOString() },
        { keepEmptyLabels: true },
      );
      setDraft({ targetId, diagram: normalized });
      pendingRef.current = { targetId, mode: docType, diagram: normalized };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => flushRef.current(), 450);
    },
    [activeSection?.type, docType, targetId],
  );

  const createDiagram = (type: DiagramType) => {
    clearMessages();
    if (docType === "document" && activeSection?.type !== "diagram") {
      setError("Adicione uma seção do tipo Diagrama antes de escolher um template.");
      return;
    }
    const created = createDiagramFromTemplate(type);
    applyDiagram(created);
    setSelectedNodeId(undefined);
    setNotice(`Diagrama “${created.title}” criado. Edite os nós ao lado.`);
  };

  const moveNode = (nodeId: string, position: { x: number; y: number }) => {
    if (!diagram) return;
    applyDiagram({
      ...diagram,
      layout: "manual",
      nodes: diagram.nodes.map((node) => (node.id === nodeId ? { ...node, position } : node)),
    });
  };

  const reorganize = () => {
    if (!diagram) return;
    clearMessages();
    applyDiagram({
      ...diagram,
      layout: "auto",
      nodes: diagram.nodes.map((node) => ({ ...node, position: undefined })),
    });
    setNotice("Layout automático recalculado.");
  };

  const generateWithAi = async () => {
    if (busy) return;
    clearMessages();
    setProposal(null);
    setProposalNote(null);
    if (!aiTopic.trim()) {
      setError("Descreva o tema do diagrama.");
      return;
    }
    setBusy("ai");
    try {
      const response = await fetch("/api/diagrams/generate", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken() },
        body: JSON.stringify({
          topic: aiTopic,
          type: diagram?.type ?? "flowchart",
          context: `${document.title}. ${studySubject ?? ""} ${studyTopic ?? ""}`.trim(),
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | { proposal?: DiagramDocument; explanation?: string; error?: string }
        | null;
      if (!response.ok || !data?.proposal) {
        throw new Error(data?.error || "Não foi possível gerar o diagrama com IA.");
      }
      setProposal(data.proposal);
      setProposalNote(data.explanation ?? "Revise a proposta antes de aplicar.");
    } catch (cause) {
      setError(errorMessage(cause, "Não foi possível gerar o diagrama com IA."));
    } finally {
      setBusy(null);
    }
  };

  const applyProposal = () => {
    if (!proposal) return;
    applyDiagram(proposal);
    setProposal(null);
    setNotice("Proposta aplicada ao diagrama. A fonte original permanece editável.");
  };

  const importMermaid = () => {
    clearMessages();
    const parsed = parseMermaid(mermaidText, { title: diagram?.title ?? "Diagrama importado do Mermaid" });
    if (!parsed.ok || !parsed.diagram) {
      setError(parsed.issues[0] ?? "Não foi possível interpretar o código Mermaid.");
      return;
    }
    const base = diagram
      ? { ...parsed.diagram, id: diagram.id, title: diagram.title, type: diagram.type }
      : parsed.diagram;
    applyDiagram(base);
    setShowMermaid(false);
    setNotice(`Mermaid importado: ${parsed.diagram.nodes.length} nós e ${parsed.diagram.edges.length} conexões.`);
  };

  const importKnowledge = async () => {
    if (busy) return;
    clearMessages();
    setBusy("knowledge");
    try {
      const graphs = await KnowledgeStorage.getByStudyId(document.studyId);
      const graph = graphs[0];
      if (!graph || !graph.concepts.length) {
        throw new Error("Nenhum Knowledge Graph encontrado para este estudo.");
      }
      const selected = [...graph.concepts].sort((left, right) => right.importance - left.importance).slice(0, 16);
      const allowed = new Set(selected.map((concept) => concept.id));
      const imported = createConceptMapFromGraph(
        `${document.title} — mapa conceitual`,
        selected,
        graph.relations.filter((relation) => allowed.has(relation.sourceId) && allowed.has(relation.targetId)),
      );
      applyDiagram(diagram ? { ...imported, id: diagram.id } : imported);
      setNotice(`Mapa conceitual importado com ${imported.nodes.length} conceitos.`);
    } catch (cause) {
      setError(errorMessage(cause, "Não foi possível importar o Knowledge Graph."));
    } finally {
      setBusy(null);
    }
  };

  const exportSvg = () => {
    if (!diagram) return;
    clearMessages();
    try {
      const result = exportDiagramSvg(diagram, { theme, transparent });
      downloadBlob(result.blob, result.fileName);
      setNotice("SVG exportado.");
    } catch (cause) {
      setError(errorMessage(cause, "Não foi possível gerar o SVG."));
    }
  };

  const exportPng = async (save: boolean) => {
    if (!diagram || busy) return;
    clearMessages();
    setBusy(save ? "library" : "png");
    try {
      const result = await exportDiagramPng(diagram, { theme, scale: Number(scale), transparent });
      if (save) {
        await saveDiagramToLibrary(diagram, result, {
          studyId: document.studyId,
          contentId: document.contentId,
          studioDocumentId: document.id,
          subject: studySubject,
          topic: studyTopic,
        });
        setNotice("PNG salvo na Biblioteca. O diagrama permanece editável no Studio.");
      } else {
        downloadBlob(result.blob, result.fileName);
        setNotice("PNG exportado.");
      }
    } catch (cause) {
      setError(errorMessage(cause, save ? "Não foi possível salvar o diagrama na Biblioteca." : "Não foi possível gerar o PNG."));
    } finally {
      setBusy(null);
    }
  };

  const typeOptions = diagramTypes.map((type) => ({ value: type, label: diagramTypeLabels[type] }));

  return (
    <div className="space-y-3 p-2">
      <div className="rounded-xl bg-muted/40 p-3">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Diagramas</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {docType === "presentation" ? targetLabel : `${targetLabel} · diagrama editável`}
        </p>
        <p className="mt-1 text-[11px] leading-4 text-muted-foreground/80">
          A fonte (nós e conexões) fica salva no documento; o SVG/PNG é apenas uma exportação.
        </p>
      </div>

      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="flex items-start gap-2 rounded-xl border border-primary/40 bg-primary/5 p-3 text-xs">
          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" /> {notice}
        </p>
      ) : null}

      {docType === "document" && diagramSections.length > 1 ? (
        <label className="block space-y-1 text-[11px] font-medium text-muted-foreground">
          Diagrama da seção
          <Select
            value={activeSectionId ?? ""}
            onValueChange={onSelectSection}
            options={diagramSections.map((section) => ({ value: section.id, label: section.title || "Seção sem título" }))}
            aria-label="Selecionar diagrama da seção"
            className="h-8 text-xs"
          />
        </label>
      ) : null}

      {docType === "presentation" && slides.length > 1 ? (
        <label className="block space-y-1 text-[11px] font-medium text-muted-foreground">
          Slide
          <Select
            value={activeSlideId ?? ""}
            onValueChange={onSelectSlide}
            options={slides.map((slide, index) => ({ value: slide.id, label: `${index + 1}. ${slide.title || "Sem título"}` }))}
            aria-label="Selecionar slide"
            className="h-8 text-xs"
          />
        </label>
      ) : null}

      {!diagram ? (
        <div className="space-y-3">
          {docType === "document" && activeSection?.type !== "diagram" ? (
            <div className="space-y-2 rounded-xl border border-dashed p-3">
              <p className="text-xs font-semibold">Seção de diagrama</p>
              <p className="text-[11px] leading-4 text-muted-foreground">
                {activeSection
                  ? `A seção “${activeSection.title || "sem título"}” é do tipo ${activeSection.type}. Crie uma seção de diagrama para anexar o desenho.`
                  : "Selecione uma seção na aba Estrutura ou crie uma seção de diagrama."}
              </p>
              <Button type="button" size="xs" onClick={onAddDiagramSection}>
                <Plus className="size-3 me-1" aria-hidden="true" /> Criar seção de diagrama
              </Button>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed p-3">
              <p className="flex items-center gap-2 text-xs font-semibold">
                <LayoutGrid className="size-3.5 text-primary" aria-hidden="true" /> Começar a partir de um template
              </p>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {diagramTypes.map((type) => (
                  <Button key={type} type="button" size="xs" variant="outline" onClick={() => createDiagram(type)}>
                    {diagramTypeLabels[type]}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {docType === "presentation" && !activeSlide ? (
            <p className="rounded-xl bg-muted/40 p-3 text-[11px] leading-4 text-muted-foreground">
              Selecione um slide no editor para anexar um diagrama.
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <div className="space-y-2 rounded-xl border p-2">
            <label className="block space-y-1 text-[11px] font-medium text-muted-foreground">
              Título do diagrama
              <Input
                value={diagram.title}
                onChange={(event) => applyDiagram({ ...diagram, title: event.target.value })}
                maxLength={DIAGRAM_LIMITS.maxTitleLength}
                className="h-8 text-xs"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1 text-[11px] font-medium text-muted-foreground">
                Tipo
                <Select
                  value={diagram.type}
                  onValueChange={(value) => applyDiagram({ ...diagram, type: value as DiagramType })}
                  options={typeOptions}
                  aria-label="Tipo do diagrama"
                  className="h-8 text-xs"
                />
              </label>
              <label className="block space-y-1 text-[11px] font-medium text-muted-foreground">
                Direção
                <Select
                  value={diagram.direction}
                  onValueChange={(value) => applyDiagram({ ...diagram, direction: value as DiagramDocument["direction"] })}
                  options={[
                    { value: "TB", label: "Vertical" },
                    { value: "LR", label: "Horizontal" },
                  ]}
                  aria-label="Direção do diagrama"
                  className="h-8 text-xs"
                />
              </label>
            </div>
            <label className="block space-y-1 text-[11px] font-medium text-muted-foreground">
              Legenda (opcional)
              <Input
                value={diagram.caption ?? ""}
                onChange={(event) => applyDiagram({ ...diagram, caption: event.target.value })}
                placeholder="Ex.: Figura 1 — fluxo do método"
                maxLength={DIAGRAM_LIMITS.maxCaptionLength}
                className="h-8 text-xs"
              />
            </label>
          </div>

          <div className="overflow-hidden rounded-xl border bg-white">
            <DiagramCanvas
              diagram={diagram}
              theme={theme}
              editable
              selectedNodeId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
              onMoveNode={moveNode}
              ariaLabel={`Diagrama editável: ${diagram.title}`}
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Button type="button" size="xs" variant="outline" onClick={reorganize}>
              <RefreshCw className="size-3 me-1" aria-hidden="true" /> Reorganizar
            </Button>
            <Button type="button" size="xs" variant="outline" onClick={exportSvg} disabled={busy !== null}>
              <Download className="size-3 me-1" aria-hidden="true" /> SVG
            </Button>
            <Button type="button" size="xs" variant="outline" onClick={() => void exportPng(false)} disabled={busy !== null}>
              {busy === "png" ? <Loader2 className="size-3 animate-spin me-1" aria-hidden="true" /> : <ImageIcon className="size-3 me-1" aria-hidden="true" />}
              PNG
            </Button>
            <Button type="button" size="xs" variant="ghost" onClick={() => void exportPng(true)} disabled={busy !== null}>
              {busy === "library" ? <Loader2 className="size-3 animate-spin me-1" aria-hidden="true" /> : <BookOpen className="size-3 me-1" aria-hidden="true" />}
              Salvar na Biblioteca
            </Button>
          </div>

          <div className="flex flex-wrap items-end gap-2 rounded-xl bg-muted/40 p-2">
            <label className="space-y-1 text-[11px] font-medium text-muted-foreground">
              Resolução do PNG
              <Select
                value={scale}
                onValueChange={setScale}
                options={[
                  { value: "1", label: "1x" },
                  { value: "2", label: "2x" },
                  { value: "3", label: "3x" },
                ]}
                aria-label="Resolução do PNG"
                className="h-7 w-20 text-[11px]"
              />
            </label>
            <label className="flex items-center gap-1.5 pb-1 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                className="size-3.5 accent-primary"
                checked={transparent}
                onChange={(event) => setTransparent(event.target.checked)}
              />
              Fundo transparente
            </label>
          </div>

          <div className="space-y-2 rounded-xl border p-2">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold">
              <Sparkles className="size-3.5 text-primary" aria-hidden="true" /> Gerar com IA
            </p>
            <Input
              value={aiTopic}
              onChange={(event) => setAiTopic(event.target.value)}
              placeholder="Tema do diagrama"
              maxLength={DIAGRAM_LIMITS.maxAiTopicLength}
              aria-label="Tema do diagrama para a IA"
              className="h-8 text-xs"
            />
            <div className="flex gap-1.5">
              <Button type="button" size="xs" onClick={() => void generateWithAi()} disabled={busy !== null}>
                {busy === "ai" ? <Loader2 className="size-3 animate-spin me-1" aria-hidden="true" /> : <Wand2 className="size-3 me-1" aria-hidden="true" />}
                Gerar proposta
              </Button>
            </div>
            <p className="text-[10px] leading-4 text-muted-foreground">
              A proposta não substitui o diagrama até você confirmar. A IA responde apenas dados estruturados.
            </p>
            {proposal ? (
              <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-2" role="status">
                <p className="text-[11px] font-semibold">Proposta: {proposal.title}</p>
                <p className="text-[10px] leading-4 text-muted-foreground">
                  {proposalNote} ({proposal.nodes.length} nós, {proposal.edges.length} conexões)
                </p>
                <div className="overflow-hidden rounded-lg border bg-white">
                  <DiagramCanvas diagram={proposal} theme={theme} ariaLabel="Prévia da proposta de diagrama" />
                </div>
                <div className="flex gap-1.5">
                  <Button type="button" size="xs" onClick={applyProposal}>Aplicar proposta</Button>
                  <Button type="button" size="xs" variant="ghost" onClick={() => setProposal(null)}>Descartar</Button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-2 rounded-xl border p-2">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold">
                <Network className="size-3.5 text-primary" aria-hidden="true" /> Fontes externas
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button type="button" size="xs" variant="outline" onClick={() => setShowMermaid((value) => !value)}>
                {showMermaid ? "Fechar Mermaid" : "Colar Mermaid"}
              </Button>
              <Button type="button" size="xs" variant="outline" onClick={() => void importKnowledge()} disabled={busy !== null}>
                {busy === "knowledge" ? <Loader2 className="size-3 animate-spin me-1" aria-hidden="true" /> : <Plus className="size-3 me-1" aria-hidden="true" />}
                Knowledge Graph
              </Button>
            </div>
            {showMermaid ? (
              <div className="space-y-1.5">
                <Textarea
                  value={mermaidText}
                  onChange={(event) => setMermaidText(event.target.value)}
                  rows={5}
                  placeholder={"flowchart TD\n  A[Início] --> B{Decisão}\n  B -->|Sim| C[Fim]"}
                  aria-label="Código Mermaid"
                  className="font-mono text-[11px] leading-4"
                />
                <Button type="button" size="xs" onClick={importMermaid}>Importar Mermaid</Button>
                <p className="text-[10px] leading-4 text-muted-foreground">
                  Subconjunto suportado: flowchart/graph com nós e conectores. Outras construções são recusadas com aviso.
                </p>
              </div>
            ) : null}
          </div>

          <DiagramInspector
            diagram={diagram}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            onChange={applyDiagram}
          />

          <p className="text-[10px] leading-4 text-muted-foreground">
            Arquivo sugerido: {diagramFileStem(diagram.title)}-diagrama.svg ou .png. Limites: {DIAGRAM_LIMITS.maxNodes} nós,{" "}
            {DIAGRAM_LIMITS.maxEdges} conexões, {DIAGRAM_LIMITS.maxLabelLength} caracteres por rótulo.
          </p>

          {selectedNodeId ? (
            <Badge variant="outline" className="text-[10px]">Nó selecionado: {selectedNodeId}</Badge>
          ) : null}
        </>
      )}
    </div>
  );
}
