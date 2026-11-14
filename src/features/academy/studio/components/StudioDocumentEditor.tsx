"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Trash2, Copy, Plus, Type, List, Code, Table, Lightbulb, ListChecks, PenLine, Sigma, Quote, Heading, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { markdownToSafeHtml } from "../sanitize";
import { STUDIO_INSERTABLE_BLOCKS, isChapterSection, isSubsectionHeading } from "../service";
import type {
  DocumentSection,
  DocumentStructure,
  StudioInsertableBlockKind,
  StudioPedagogicalTemplate,
  StudioPedagogicalTemplateId,
} from "../types";

const SECTION_TYPES: { id: DocumentSection["type"]; label: string; icon: typeof Type }[] = [
  { id: "heading", label: "Título", icon: Heading },
  { id: "paragraph", label: "Parágrafo", icon: Type },
  { id: "list", label: "Lista", icon: List },
  { id: "code", label: "Código", icon: Code },
  { id: "table", label: "Tabela", icon: Table },
  { id: "example", label: "Exemplo", icon: Lightbulb },
  { id: "exercise", label: "Exercício", icon: ListChecks },
  { id: "summary", label: "Resumo", icon: PenLine },
  { id: "diagram", label: "Diagrama", icon: Sigma },
  { id: "blockquote", label: "Citação", icon: Quote },
];

const HEADING_LEVEL_OPTIONS = [
  { value: "1", label: "Capítulo (Nível 1)" },
  { value: "2", label: "Subseção (Nível 2)" },
  { value: "3", label: "Tópico (Nível 3)" },
];

const QUICK_INSERT_KINDS: { kind: StudioInsertableBlockKind; label: string }[] = [
  { kind: "chapter", label: "Capítulo" },
  { kind: "paragraph", label: "Parágrafo" },
  { kind: "list", label: "Lista" },
  { kind: "summary", label: "Resumo" },
  { kind: "exercise", label: "Exercício" },
  { kind: "example", label: "Exemplo" },
  { kind: "code", label: "Código" },
  { kind: "table", label: "Tabela" },
  { kind: "blockquote", label: "Citação" },
  { kind: "diagram", label: "Diagrama" },
];

interface StudioDocumentEditorProps {
  structure?: DocumentStructure;
  activeSectionId?: string;
  pedagogicalTemplates?: StudioPedagogicalTemplate[];
  currentPedagogicalTemplate?: StudioPedagogicalTemplateId;
  onApplyPedagogicalTemplate?: (templateId: StudioPedagogicalTemplateId) => void;
  onSectionClick: (id: string) => void;
  onAddSection: () => void;
  onAddTypedSection?: (kind: StudioInsertableBlockKind, afterSectionId?: string) => void;
  onUpdateStructure: (updates: Partial<DocumentStructure>) => void;
  onUpdateSection: (id: string, updates: Partial<DocumentSection>) => void;
  onRemoveSection: (id: string) => void;
  onDuplicateSection: (id: string) => void;
  onReorder: (sectionIds: string[]) => void;
  readOnly?: boolean;
}

export function StudioDocumentEditor({
  structure,
  activeSectionId,
  pedagogicalTemplates = [],
  currentPedagogicalTemplate,
  onApplyPedagogicalTemplate,
  onSectionClick,
  onAddSection,
  onAddTypedSection,
  onUpdateStructure,
  onUpdateSection,
  onRemoveSection,
  onDuplicateSection,
  onReorder,
  readOnly = false,
}: StudioDocumentEditorProps) {
  const [draft, setDraft] = useState("");
  const [draftSectionId, setDraftSectionId] = useState<string | undefined>();
  const syncedContent = useRef<string | null>(null);
  const syncedTitle = useRef<string | null>(null);
  const [metaDraft, setMetaDraft] = useState({ title: "", subtitle: "", description: "" });
  const [titleDraft, setTitleDraft] = useState("");
  const [bottomInsertKind, setBottomInsertKind] = useState<StudioInsertableBlockKind>("paragraph");
  const [inlineInsertKind, setInlineInsertKind] = useState<StudioInsertableBlockKind>("paragraph");

  const sections = useMemo(() => structure?.sections ?? [], [structure?.sections]);
  const activeSection = sections.find((section) => section.id === activeSectionId);

  useEffect(() => {
    setMetaDraft({
      title: structure?.title ?? "",
      subtitle: structure?.subtitle ?? "",
      description: structure?.description ?? "",
    });
  }, [structure?.title, structure?.subtitle, structure?.description]);

  useEffect(() => {
    if (!activeSection) return;
    const content = activeSection.content ?? "";
    if (draftSectionId !== activeSection.id) {
      setDraft(content);
      setDraftSectionId(activeSection.id);
      setTitleDraft(activeSection.title ?? "");
      syncedContent.current = content;
      syncedTitle.current = activeSection.title ?? "";
      return;
    }
    // Alteração externa (por exemplo, sugestão da IA) enquanto a seção está em foco.
    if (syncedContent.current !== content) {
      const previousContent = syncedContent.current;
      syncedContent.current = content;
      if (draft === previousContent && draft !== content) setDraft(content);
    }
    const currentTitle = activeSection.title ?? "";
    if (syncedTitle.current !== currentTitle) {
      syncedTitle.current = currentTitle;
      if (titleDraft !== currentTitle) setTitleDraft(currentTitle);
    }
  }, [activeSection, draftSectionId, draft, titleDraft]);

  const handleCommit = useCallback(() => {
    if (!draftSectionId || !activeSection) return;
    if (draft === (activeSection.content ?? "")) return;
    onUpdateSection(draftSectionId, { content: draft });
  }, [activeSection, draft, draftSectionId, onUpdateSection]);

  useEffect(() => {
    if (readOnly || !activeSection || draftSectionId !== activeSection.id || draft === (activeSection.content ?? "")) return;
    const timer = window.setTimeout(() => onUpdateSection(activeSection.id, { content: draft }), 800);
    return () => window.clearTimeout(timer);
  }, [activeSection, draft, draftSectionId, onUpdateSection, readOnly]);

  const handleInsertKind = useCallback(
    (kind: StudioInsertableBlockKind, afterSectionId?: string) => {
      if (onAddTypedSection) {
        onAddTypedSection(kind, afterSectionId);
        return;
      }
      onAddSection();
    },
    [onAddSection, onAddTypedSection],
  );

  const handleMove = useCallback((id: string, direction: "up" | "down") => {
    const ids = sections.map((section) => section.id);
    const index = ids.indexOf(id);
    if (index === -1) return;
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    onReorder(ids);
  }, [sections, onReorder]);

  if (!structure) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center">
        <p className="text-sm text-muted-foreground">Selecione um documento para começar a editar.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Metadata */}
      {!readOnly && (
        <div className="space-y-3 border-b p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              Título
              <Input
                value={metaDraft.title}
                onChange={(event) => setMetaDraft((current) => ({ ...current, title: event.target.value }))}
                onBlur={() => onUpdateStructure({ title: metaDraft.title })}
                placeholder="Título do documento"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              Subtítulo
              <Input
                value={metaDraft.subtitle}
                onChange={(event) => setMetaDraft((current) => ({ ...current, subtitle: event.target.value }))}
                onBlur={() => onUpdateStructure({ subtitle: metaDraft.subtitle })}
                placeholder="Subtítulo do documento"
              />
            </label>
          </div>
          <label className="block space-y-1 text-xs font-medium text-muted-foreground">
            Descrição
            <Input
              value={metaDraft.description}
              onChange={(event) => setMetaDraft((current) => ({ ...current, description: event.target.value }))}
              onBlur={() => onUpdateStructure({ description: metaDraft.description })}
              placeholder="Resumo curto exibido na capa"
            />
          </label>
          {onApplyPedagogicalTemplate && pedagogicalTemplates.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/40 p-2.5">
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground">Template pedagógico</p>
                <p className="text-[11px] text-muted-foreground">
                  Escolha a estrutura didática de blocos para este documento.
                </p>
              </div>
              <Select
                value={currentPedagogicalTemplate ?? "structured-lesson"}
                onValueChange={(value) => onApplyPedagogicalTemplate(value as StudioPedagogicalTemplateId)}
                options={pedagogicalTemplates.map((item) => ({ value: item.id, label: item.name }))}
                aria-label="Template pedagógico"
                className="h-8 w-full sm:w-56 text-xs"
              />
            </div>
          ) : null}
        </div>
      )}

      {/* Sections */}
      <ScrollArea className="flex-1 p-4">
        <div className="mx-auto max-w-3xl space-y-4">
          {sections.map((section, index) => {
            const isChapter = isChapterSection(section);
            const isSubsection = isSubsectionHeading(section);
            const Icon = isChapter
              ? BookOpen
              : (SECTION_TYPES.find((item) => item.id === section.type)?.icon ?? Type);
            const isActive = section.id === activeSectionId;
            const badgeLabel = isChapter
              ? "Capítulo"
              : isSubsection
                ? "Subseção"
                : (SECTION_TYPES.find((item) => item.id === section.type)?.label ?? section.type);
            return (
              <article
                key={section.id}
                data-section-id={section.id}
                data-section-type={section.type}
                data-section-level={section.level ?? 2}
                className={`group rounded-xl border p-4 transition-colors ${
                  isActive
                    ? "border-primary bg-primary/5"
                    : isChapter
                      ? "border-primary/25 bg-muted/20 hover:bg-muted/35"
                      : "hover:bg-muted/30"
                }`}
              >
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Icon className="size-4 text-primary" aria-hidden="true" />
                  {isActive && !readOnly ? (
                    <Input
                      value={titleDraft}
                      onChange={(event) => setTitleDraft(event.target.value)}
                      onBlur={() => {
                        if (titleDraft !== (section.title ?? "")) {
                          onUpdateSection(section.id, { title: titleDraft });
                        }
                      }}
                      placeholder="Título da seção"
                      className="h-8 max-w-xs flex-1 text-sm font-semibold"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSectionClick(section.id)}
                      className="text-start text-sm font-semibold hover:underline"
                    >
                      {section.title || "Sem título"}
                    </button>
                  )}
                  <Badge variant={isChapter ? "secondary" : "outline"} className="text-[10px] capitalize">
                    {badgeLabel}
                  </Badge>
                  <span className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    {!readOnly && (
                      <>
                        <Button type="button" size="icon-xs" variant="ghost" onClick={() => handleMove(section.id, "up")} disabled={index === 0} aria-label="Mover seção para cima">
                          <span aria-hidden="true">↑</span>
                        </Button>
                        <Button type="button" size="icon-xs" variant="ghost" onClick={() => handleMove(section.id, "down")} disabled={index === sections.length - 1} aria-label="Mover seção para baixo">
                          <span aria-hidden="true">↓</span>
                        </Button>
                        <Button type="button" size="icon-xs" variant="ghost" onClick={() => onDuplicateSection(section.id)} aria-label="Duplicar seção">
                          <Copy className="size-3" />
                        </Button>
                        <Button type="button" size="icon-xs" variant="ghost" onClick={() => onRemoveSection(section.id)} aria-label="Excluir seção">
                          <Trash2 className="size-3 text-destructive" />
                        </Button>
                      </>
                    )}
                  </span>
                </div>

                {isActive && !readOnly ? (
                  <div className="space-y-2.5">
                    <Textarea
                      value={draftSectionId === section.id ? draft : section.content}
                      onChange={(event) => {
                        setDraftSectionId(section.id);
                        setDraft(event.target.value);
                      }}
                      onBlur={handleCommit}
                      rows={8}
                      placeholder="Escreva o conteúdo da seção (Markdown permitido)"
                      className="text-sm leading-6"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={section.type}
                        onValueChange={(value) => {
                          const nextType = value as DocumentSection["type"];
                          const nextLevel = nextType === "heading" ? (section.level ?? 1) : (section.level ?? 2);
                          onUpdateSection(section.id, { type: nextType, level: nextLevel });
                        }}
                        options={SECTION_TYPES.map((item) => ({ value: item.id, label: item.label }))}
                        aria-label="Tipo da seção"
                        className="h-8 w-40 text-xs"
                      />
                      {section.type === "heading" ? (
                        <Select
                          value={String(section.level ?? 1)}
                          onValueChange={(value) =>
                            onUpdateSection(section.id, { level: Number(value) as 1 | 2 | 3 })
                          }
                          options={HEADING_LEVEL_OPTIONS}
                          aria-label="Nível do título"
                          className="h-8 w-44 text-xs"
                        />
                      ) : null}
                      <span className="text-[11px] text-muted-foreground">
                        Alterações são salvas automaticamente.
                      </span>
                    </div>

                    {onAddTypedSection ? (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed bg-background/60 p-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] font-medium text-muted-foreground">
                            Inserir abaixo desta seção:
                          </span>
                          <Select
                            value={inlineInsertKind}
                            onValueChange={(value) => setInlineInsertKind(value as StudioInsertableBlockKind)}
                            options={STUDIO_INSERTABLE_BLOCKS.map((item) => ({ value: item.kind, label: item.label }))}
                            aria-label="Tipo de bloco para inserir abaixo"
                            className="h-7 w-44 text-xs"
                          />
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            onClick={() => handleInsertKind(inlineInsertKind, section.id)}
                          >
                            <Plus className="size-3 me-1" aria-hidden="true" />
                            Inserir abaixo
                          </Button>
                        </div>
                        <div className="flex flex-wrap items-center gap-1">
                          {(["chapter", "summary", "exercise", "example", "paragraph"] as StudioInsertableBlockKind[]).map((kind) => {
                            const blockInfo = STUDIO_INSERTABLE_BLOCKS.find((item) => item.kind === kind)!;
                            return (
                              <Button
                                key={kind}
                                type="button"
                                size="xs"
                                variant="ghost"
                                className="h-6 px-2 text-[11px]"
                                onClick={() => handleInsertKind(kind, section.id)}
                                aria-label={`Inserir ${blockInfo.shortLabel.toLowerCase()} abaixo`}
                              >
                                + {blockInfo.shortLabel}
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div
                    className="studio-content text-sm leading-6 text-foreground"
                    dangerouslySetInnerHTML={{ __html: markdownToSafeHtml(section.content) }}
                  />
                )}
              </article>
            );
          })}

          {!readOnly && (
            <div className="space-y-3 rounded-xl border-2 border-dashed p-4 text-center">
              <p className="text-sm font-medium text-foreground">Adicionar bloco ao final do documento</p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {onAddTypedSection ? (
                  <Select
                    value={bottomInsertKind}
                    onValueChange={(value) => setBottomInsertKind(value as StudioInsertableBlockKind)}
                    options={STUDIO_INSERTABLE_BLOCKS.map((item) => ({ value: item.kind, label: item.label }))}
                    aria-label="Tipo de bloco para adicionar"
                    className="h-8 w-48 text-xs"
                  />
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => (onAddTypedSection ? handleInsertKind(bottomInsertKind) : onAddSection())}
                >
                  <Plus className="size-3.5 me-1" /> Adicionar seção
                </Button>
              </div>
              {onAddTypedSection ? (
                <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1" role="group" aria-label="Inserção rápida de blocos">
                  {QUICK_INSERT_KINDS.map((item) => (
                    <Button
                      key={item.kind}
                      type="button"
                      size="xs"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => handleInsertKind(item.kind)}
                      aria-label={`Adicionar ${item.label.toLowerCase()}`}
                    >
                      + {item.label}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
