"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Download,
  FileText,
  LayoutTemplate,
  Palette,
  Presentation,
  Redo2,
  Save,
  Sparkles,
  Undo2,
  Columns2,
  Eye,
  Pencil,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useStudioEditor } from "./hooks/useStudioEditor";
import { StudioService } from "./service";
import { StudioAIPanel } from "./components/StudioAIPanel";
import { StudioCustomizationPanel } from "./components/StudioCustomizationPanel";
import { StudioDocumentEditor } from "./components/StudioDocumentEditor";
import { StudioDocumentSidebar } from "./components/StudioDocumentSidebar";
import { StudioExportPanel } from "./components/StudioExportPanel";
import { StudioPreviewPanel } from "./components/StudioPreviewPanel";
import { StudioPresentationEditor } from "./components/StudioPresentationEditor";
import { StudioTemplatesPanel } from "./components/StudioTemplatesPanel";
import type { AcademyGeneratedContent, AcademyStudy } from "../types";
import type { StudioDocumentTemplate, StudioDocumentType } from "./types";

const DEFAULT_TEMPLATES: Record<StudioDocumentType, StudioDocumentTemplate> = {
  document: "academic",
  presentation: "academic-presentation",
};

type MobileTab = "editor" | "preview" | "structure";

interface StudioEditorProps {
  study: AcademyStudy;
  content: AcademyGeneratedContent;
  docType?: StudioDocumentType;
  onClose: () => void;
  onOpenWorkspace?: () => void;
}

export function StudioEditor({ study, content, docType = "document", onClose, onOpenWorkspace }: StudioEditorProps) {
  const editor = useStudioEditor();
  const {
    document,
    editorState,
    availableTemplates,
    isSaving,
    isLoading,
    lastError,
    canUndo,
    canRedo,
    loadDocument,
    createNew,
    saveDocument,
    addSection,
    updateSection,
    updateStructure,
    removeSection,
    duplicateSection,
    reorderSections,
    addSlide,
    updateSlide,
    removeSlide,
    duplicateSlide,
    reorderSlides,
    changeTemplate,
    updateCustomization,
    registerExport,
    undo,
    redo,
    setViewMode,
    setSidebarTab,
    setActiveSection,
    setActiveSlide,
    clearError,
  } = editor;

  const [mobileTab, setMobileTab] = useState<MobileTab>("editor");
  const [ready, setReady] = useState(false);

  // As ações do hook mudam de identidade a cada alteração do documento.
  // Mantê-las em uma ref evita recarregar o documento a cada edição.
  const actionsRef = useRef({ loadDocument, createNew });
  actionsRef.current = { loadDocument, createNew };
  const ensuredKey = useRef<string | null>(null);

  // Garante um documento do Studio para o conteúdo, sem criar cópias duplicadas.
  useEffect(() => {
    const key = `${study.id}::${content.id}::${docType}`;
    if (ensuredKey.current === key) return;
    ensuredKey.current = key;
    void (async () => {
      const existing = await StudioService.listDocuments(study.id);
      // Um documento e uma apresentação do mesmo conteúdo são artefatos distintos.
      const match = existing.find((item) => item.contentId === content.id && item.type === docType);
      if (match) await actionsRef.current.loadDocument(match.id);
      else await actionsRef.current.createNew(study.id, content, docType, DEFAULT_TEMPLATES[docType], content.kind);
      setReady(true);
    })();
  }, [study.id, content.id, docType, content]);

  const sections = useMemo(() => document?.documentStructure?.sections ?? [], [document?.documentStructure?.sections]);
  const slides = useMemo(() => document?.slides ?? [], [document?.slides]);
  const activeSection = sections.find((section) => section.id === editorState.activeSectionId);
  const activeSlide = slides.find((slide) => slide.id === editorState.activeSlideId);

  const aiTarget = useMemo(() => {
    if (docType === "presentation") {
      return {
        text: activeSlide?.content ?? "",
        label: activeSlide ? `Slide: ${activeSlide.title || "Sem título"}` : "Nenhum slide selecionado",
      };
    }
    return {
      text: activeSection?.content ?? "",
      label: activeSection ? `Seção: ${activeSection.title || "Sem título"}` : "Nenhuma seção selecionada",
    };
  }, [docType, activeSlide, activeSection]);

  const applyAiSuggestion = useCallback(
    (text: string) => {
      if (docType === "presentation") {
        if (activeSlide) void updateSlide(activeSlide.id, { content: text });
        return;
      }
      if (activeSection) void updateSection(activeSection.id, { content: text });
    },
    [docType, activeSlide, activeSection, updateSlide, updateSection],
  );

  const moveItem = useCallback(
    (id: string, direction: "up" | "down", kind: "section" | "slide") => {
      if (kind === "slide") {
        const ids = slides.map((slide) => slide.id);
        const index = ids.indexOf(id);
        if (index === -1) return;
        const target = direction === "up" ? index - 1 : index + 1;
        if (target < 0 || target >= ids.length) return;
        [ids[index], ids[target]] = [ids[target], ids[index]];
        void reorderSlides(ids);
        return;
      }
      const ids = sections.map((section) => section.id);
      const index = ids.indexOf(id);
      if (index === -1) return;
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= ids.length) return;
      [ids[index], ids[target]] = [ids[target], ids[index]];
      void reorderSections(ids);
    },
    [slides, sections, reorderSlides, reorderSections],
  );

  const handleAddSection = useCallback(() => {
    void addSection({ type: "paragraph", title: "Nova seção", content: "", level: 2 });
  }, [addSection]);

  const handleAddSlide = useCallback(() => {
    void addSlide({ layout: "title-content", title: "Novo slide", content: "" });
  }, [addSlide]);

  const handleExported = useCallback(
    (outcome: { kind: "pdf" | "pptx"; fileName: string; size: number; pageCount?: number; slideCount?: number; materialId: string }) => {
      void registerExport({
        id: outcome.materialId,
        kind: outcome.kind,
        format: outcome.kind,
        fileName: outcome.fileName,
        size: outcome.size,
        pageCount: outcome.pageCount,
        slideCount: outcome.slideCount,
        materialId: outcome.materialId,
        persistentBinary: true,
        createdAt: new Date().toISOString(),
      });
    },
    [registerExport],
  );

  if (!document && (isLoading || !ready)) {
    return (
      <div className="flex h-[70dvh] items-center justify-center" aria-label="Carregando documento do Studio">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" aria-hidden="true" />
          <p className="text-sm">Preparando o editor do Studio…</p>
        </div>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="flex h-[70dvh] flex-col items-center justify-center gap-3 p-8 text-center">
        <FileText className="size-10 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-lg font-semibold">Nenhum documento aberto</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          {lastError ?? "Selecione um conteúdo da Academy para editar no Studio."}
        </p>
        <Button type="button" variant="outline" onClick={onClose}>
          <ArrowLeft className="size-3.5 me-1" aria-hidden="true" /> Voltar
        </Button>
      </div>
    );
  }

  const showEditor = mobileTab === "editor";
  const showPreview = mobileTab === "preview";
  const showStructure = mobileTab === "structure";

  const sidebarContent = (
    <Tabs
      value={editorState.sidebarTab}
      onValueChange={(value) => setSidebarTab(value as typeof editorState.sidebarTab)}
      className="flex h-full min-h-0 flex-col"
    >
      <TabsList className="mx-2 mt-2 grid shrink-0 grid-cols-5 gap-1">
        <TabsTrigger value="structure" className="text-[11px]"><FileText className="size-3.5" aria-hidden="true" /><span className="sr-only">Estrutura</span></TabsTrigger>
        <TabsTrigger value="templates" className="text-[11px]"><LayoutTemplate className="size-3.5" aria-hidden="true" /><span className="sr-only">Templates</span></TabsTrigger>
        <TabsTrigger value="customization" className="text-[11px]"><Palette className="size-3.5" aria-hidden="true" /><span className="sr-only">Personalização</span></TabsTrigger>
        <TabsTrigger value="ai-assist" className="text-[11px]"><Sparkles className="size-3.5" aria-hidden="true" /><span className="sr-only">Assistência por IA</span></TabsTrigger>
        <TabsTrigger value="export" className="text-[11px]"><Download className="size-3.5" aria-hidden="true" /><span className="sr-only">Exportar</span></TabsTrigger>
      </TabsList>
      <ScrollArea className="min-h-0 flex-1">
        <TabsContent value="structure" className="mt-0">
          <StudioDocumentSidebar
            docType={docType}
            sections={sections}
            slides={slides}
            activeSectionId={editorState.activeSectionId}
            activeSlideId={editorState.activeSlideId}
            onSectionClick={setActiveSection}
            onSlideClick={setActiveSlide}
            onAddSection={handleAddSection}
            onAddSlide={handleAddSlide}
            onRemoveSection={(id) => void removeSection(id)}
            onDuplicateSection={(id) => void duplicateSection(id)}
            onRemoveSlide={(id) => void removeSlide(id)}
            onDuplicateSlide={(id) => void duplicateSlide(id)}
            onMoveSection={(id, direction) => moveItem(id, direction, "section")}
            onMoveSlide={(id, direction) => moveItem(id, direction, "slide")}
          />
        </TabsContent>
        <TabsContent value="templates" className="mt-0">
          <StudioTemplatesPanel
            templates={availableTemplates}
            currentTemplate={document.template}
            docType={docType}
            onSelectTemplate={(templateId) => void changeTemplate(templateId)}
          />
        </TabsContent>
        <TabsContent value="customization" className="mt-0">
          <StudioCustomizationPanel
            customization={document.customization}
            onChange={(updates) => void updateCustomization(updates)}
          />
        </TabsContent>
        <TabsContent value="ai-assist" className="mt-0">
          <StudioAIPanel
            text={aiTarget.text}
            targetLabel={aiTarget.label}
            context={`${document.title}. ${study.subject}. ${study.topic}`}
            onApply={applyAiSuggestion}
          />
        </TabsContent>
        <TabsContent value="export" className="mt-0">
          <StudioExportPanel
            document={document}
            studySubject={study.subject}
            studyTopic={study.topic}
            onExported={handleExported}
          />
        </TabsContent>
      </ScrollArea>
    </Tabs>
  );

  const editorArea = docType === "presentation" ? (
    <StudioPresentationEditor
      slides={slides}
      activeSlideId={editorState.activeSlideId}
      onSlideClick={setActiveSlide}
      onAddSlide={handleAddSlide}
      onUpdateSlide={(id, updates) => void updateSlide(id, updates)}
      onRemoveSlide={(id) => void removeSlide(id)}
      onDuplicateSlide={(id) => void duplicateSlide(id)}
      onReorder={(ids) => void reorderSlides(ids)}
    />
  ) : (
    <StudioDocumentEditor
      structure={document.documentStructure}
      activeSectionId={editorState.activeSectionId}
      onSectionClick={setActiveSection}
      onAddSection={handleAddSection}
      onUpdateStructure={(updates) => void updateStructure(updates)}
      onUpdateSection={(id, updates) => void updateSection(id, updates)}
      onRemoveSection={(id) => void removeSection(id)}
      onDuplicateSection={(id) => void duplicateSection(id)}
      onReorder={(ids) => void reorderSections(ids)}
    />
  );

  const previewArea = (
    <StudioPreviewPanel
      structure={document.documentStructure}
      slides={slides}
      docType={docType}
      customization={document.customization}
    />
  );

  return (
    <TooltipProvider>
      <div className="flex h-[calc(100dvh-9rem)] min-h-[34rem] flex-col gap-3 overflow-hidden lg:h-[calc(100dvh-12rem)]">
        {/* Barra superior */}
        <header className="flex shrink-0 flex-wrap items-center gap-2 border-b pb-3">
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Voltar para a Academy">
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold">{document.title}</h2>
            <p className="truncate text-[11px] text-muted-foreground">
              {study.subject} · {study.topic}
            </p>
          </div>
          <Badge variant="outline" className="hidden gap-1 sm:inline-flex">
            {docType === "presentation" ? <Presentation className="size-3" aria-hidden="true" /> : <FileText className="size-3" aria-hidden="true" />}
            {docType === "presentation" ? "Apresentação" : "Documento"}
          </Badge>
          {editorState.unsavedChanges ? <Badge variant="secondary">Alterações pendentes</Badge> : null}
          {isSaving ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Salvando" /> : null}

          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="ghost" size="icon" onClick={undo} disabled={!canUndo} aria-label="Desfazer">
                  <Undo2 className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Desfazer</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="ghost" size="icon" onClick={redo} disabled={!canRedo} aria-label="Refazer">
                  <Redo2 className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refazer</TooltipContent>
            </Tooltip>
            <Button type="button" size="sm" variant="outline" onClick={() => void saveDocument()}>
              <Save className="size-3.5 me-1" aria-hidden="true" /> Salvar
            </Button>
            {onOpenWorkspace ? (
              <Button type="button" size="sm" variant="ghost" onClick={onOpenWorkspace}>
                Abrir no Workspace
              </Button>
            ) : null}
          </div>

          <div className="hidden items-center gap-1 rounded-xl border p-1 lg:flex" role="group" aria-label="Modo de visualização">
            <Button
              type="button"
              size="icon-xs"
              variant={editorState.viewMode === "edit" ? "secondary" : "ghost"}
              onClick={() => setViewMode("edit")}
              aria-label="Somente editor"
            >
              <Pencil className="size-3" />
            </Button>
            <Button
              type="button"
              size="icon-xs"
              variant={editorState.viewMode === "split" ? "secondary" : "ghost"}
              onClick={() => setViewMode("split")}
              aria-label="Editor e prévia"
            >
              <Columns2 className="size-3" />
            </Button>
            <Button
              type="button"
              size="icon-xs"
              variant={editorState.viewMode === "preview" ? "secondary" : "ghost"}
              onClick={() => setViewMode("preview")}
              aria-label="Somente prévia"
            >
              <Eye className="size-3" />
            </Button>
          </div>
        </header>

        {lastError ? (
          <p role="alert" className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            {lastError}
            <Button type="button" size="xs" variant="ghost" onClick={clearError}>Dispensar</Button>
          </p>
        ) : null}

        {/* Alternador de painéis (mobile) */}
        <div className="grid shrink-0 grid-cols-3 gap-1 rounded-xl border p-1 lg:hidden" role="tablist" aria-label="Painéis do Studio">
          {([
            { id: "editor", label: "Editar", icon: Pencil },
            { id: "preview", label: "Prévia", icon: Eye },
            { id: "structure", label: "Organizar", icon: FileText },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={mobileTab === tab.id}
              onClick={() => setMobileTab(tab.id)}
              className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                mobileTab === tab.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <tab.icon className="size-3.5" aria-hidden="true" /> {tab.label}
            </button>
          ))}
        </div>

        {/* Conteúdo: painel lateral, editor e prévia (uma única instância de cada) */}
        <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
          <aside
            className={`${showStructure ? "flex" : "hidden"} min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-xl border bg-card/60 lg:flex lg:w-72`}
            aria-label="Painel do Studio"
          >
            {sidebarContent}
          </aside>

          <section
            className={`${showEditor ? "flex" : "hidden"} min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card/40 lg:flex ${editorState.viewMode === "preview" ? "lg:hidden" : ""}`}
            aria-label="Editor"
          >
            {editorArea}
          </section>

          <section
            className={`${showPreview ? "flex" : "hidden"} min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border lg:flex ${editorState.viewMode === "edit" ? "lg:hidden" : ""}`}
            aria-label="Pré-visualização"
          >
            {previewArea}
          </section>
        </div>
      </div>
    </TooltipProvider>
  );
}
