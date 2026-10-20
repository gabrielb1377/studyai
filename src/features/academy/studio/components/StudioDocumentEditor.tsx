"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Trash2, Copy, Plus, Type, List, Code, Table, Lightbulb, ListChecks, PenLine, Sigma, Quote, Heading } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { markdownToSafeHtml } from "../sanitize";
import type { DocumentSection, DocumentStructure } from "../types";

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

interface StudioDocumentEditorProps {
  structure?: DocumentStructure;
  activeSectionId?: string;
  onSectionClick: (id: string) => void;
  onAddSection: () => void;
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
  onSectionClick,
  onAddSection,
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
      syncedContent.current = content;
      if (draft !== content) setDraft(content);
    }
    const currentTitle = activeSection.title ?? "";
    if (syncedTitle.current !== currentTitle) {
      syncedTitle.current = currentTitle;
      if (titleDraft !== currentTitle) setTitleDraft(currentTitle);
    }
  }, [activeSection, draftSectionId, draft, titleDraft]);

  const handleCommit = useCallback(() => {
    if (!draftSectionId) return;
    onUpdateSection(draftSectionId, { content: draft });
  }, [draft, draftSectionId, onUpdateSection]);

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
        </div>
      )}

      {/* Sections */}
      <ScrollArea className="flex-1 p-4">
        <div className="mx-auto max-w-3xl space-y-4">
          {sections.map((section, index) => {
            const Icon = SECTION_TYPES.find((item) => item.id === section.type)?.icon ?? Type;
            const isActive = section.id === activeSectionId;
            return (
              <article
                key={section.id}
                className={`group rounded-xl border p-4 transition-colors ${
                  isActive ? "border-primary bg-primary/5" : "hover:bg-muted/30"
                }`}
              >
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Icon className="size-4 text-primary" aria-hidden="true" />
                  {isActive && !readOnly ? (
                    <Input
                      value={titleDraft}
                      onChange={(event) => setTitleDraft(event.target.value)}
                      onBlur={() => onUpdateSection(section.id, { title: titleDraft })}
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
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {SECTION_TYPES.find((item) => item.id === section.type)?.label ?? section.type}
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
                  <div className="space-y-2">
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
                        onValueChange={(value) => onUpdateSection(section.id, { type: value as DocumentSection["type"] })}
                        options={SECTION_TYPES.map((item) => ({ value: item.id, label: item.label }))}
                        aria-label="Tipo da seção"
                        className="h-8 w-44 text-xs"
                      />
                      <span className="text-[11px] text-muted-foreground">
                        Alterações são salvas automaticamente.
                      </span>
                    </div>
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
            <div className="rounded-xl border-2 border-dashed p-4 text-center">
              <p className="text-sm text-muted-foreground">Adicionar uma nova seção ao documento.</p>
              <Button type="button" variant="outline" size="sm" className="mt-2" onClick={onAddSection}>
                <Plus className="size-3.5 me-1" /> Adicionar seção
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
