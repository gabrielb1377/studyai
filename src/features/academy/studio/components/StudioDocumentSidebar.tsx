"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  GripVertical,
  Copy,
  ChevronDown,
  ChevronRight,
  FileText,
  List,
  Code,
  Table,
  Lightbulb,
  PenLine,
  ListChecks,
  Sigma,
  Quote,
  Heading,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { isChapterSection, isSubsectionHeading } from "../service";
import type { DocumentSection, Slide, StudioInsertableBlockKind } from "../types";

const SECTION_ICONS: Record<DocumentSection["type"], typeof FileText> = {
  heading: Heading,
  paragraph: FileText,
  list: List,
  code: Code,
  table: Table,
  example: Lightbulb,
  exercise: ListChecks,
  summary: PenLine,
  diagram: Sigma,
  blockquote: Quote,
};

const SECTION_LABELS: Record<DocumentSection["type"], string> = {
  heading: "Título",
  paragraph: "Parágrafo",
  list: "Lista",
  code: "Código",
  table: "Tabela",
  example: "Exemplo",
  exercise: "Exercício",
  summary: "Resumo",
  diagram: "Diagrama",
  blockquote: "Citação",
};

const LAYOUT_LABELS: Record<Slide["layout"], string> = {
  cover: "Capa",
  "title-content": "Título e conteúdo",
  "two-column": "Duas colunas",
  comparison: "Comparação",
  "image-text": "Imagem e texto",
  diagram: "Diagrama",
  code: "Código",
  exercise: "Exercício",
  summary: "Resumo",
  blank: "Em branco",
};

interface StudioDocumentSidebarProps {
  docType: "document" | "presentation";
  sections?: DocumentSection[];
  slides?: Slide[];
  activeSectionId?: string;
  activeSlideId?: string;
  onSectionClick: (id: string) => void;
  onSlideClick: (id: string) => void;
  onAddSection: () => void;
  onAddTypedSection?: (kind: StudioInsertableBlockKind, afterSectionId?: string) => void;
  onAddSlide: () => void;
  onRemoveSection?: (id: string) => void;
  onDuplicateSection?: (id: string) => void;
  onRemoveSlide?: (id: string) => void;
  onDuplicateSlide?: (id: string) => void;
  onMoveSection?: (id: string, direction: "up" | "down") => void;
  onMoveSlide?: (id: string, direction: "up" | "down") => void;
}

export function StudioDocumentSidebar({
  docType,
  sections = [],
  slides = [],
  activeSectionId,
  activeSlideId,
  onSectionClick,
  onSlideClick,
  onAddSection,
  onAddTypedSection,
  onAddSlide,
  onRemoveSection,
  onDuplicateSection,
  onRemoveSlide,
  onDuplicateSlide,
  onMoveSection,
  onMoveSlide,
}: StudioDocumentSidebarProps) {
  const [collapsedChapters, setCollapsedChapters] = useState<Record<string, boolean>>({});

  const hierarchy = useMemo(() => {
    const parentChapterBySectionId: Record<string, string | undefined> = {};
    const childCountByChapterId: Record<string, number> = {};
    const chapterIndexById: Record<string, number> = {};
    let currentChapterId: string | undefined;
    let chapterNumber = 0;

    for (const section of sections) {
      if (isChapterSection(section)) {
        chapterNumber += 1;
        currentChapterId = section.id;
        chapterIndexById[section.id] = chapterNumber;
        childCountByChapterId[section.id] = 0;
      } else if (currentChapterId) {
        parentChapterBySectionId[section.id] = currentChapterId;
        childCountByChapterId[currentChapterId] = (childCountByChapterId[currentChapterId] ?? 0) + 1;
      }
    }

    return {
      parentChapterBySectionId,
      childCountByChapterId,
      chapterIndexById,
      hasChapters: chapterNumber > 0,
    };
  }, [sections]);

  // Se uma seção filha se tornar ativa e seu capítulo estiver recolhido, expande o capítulo.
  useEffect(() => {
    if (!activeSectionId) return;
    const parentChapterId = hierarchy.parentChapterBySectionId[activeSectionId];
    if (parentChapterId && collapsedChapters[parentChapterId]) {
      setCollapsedChapters((current) => ({ ...current, [parentChapterId]: false }));
    }
  }, [activeSectionId, hierarchy.parentChapterBySectionId, collapsedChapters]);

  if (docType === "presentation") {
    return (
      <div className="space-y-2 p-2">
        <div className="flex items-center justify-between px-1">
          <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Slides</h4>
          <Button type="button" size="icon-xs" variant="ghost" onClick={onAddSlide} aria-label="Adicionar slide">
            <Plus className="size-3.5" />
          </Button>
        </div>
        {slides.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
            Nenhum slide ainda. Use o botão acima para criar o primeiro.
          </p>
        ) : (
          <ul className="space-y-1">
            {slides.map((slide, index) => (
              <li key={slide.id}>
                <div
                  className={`group flex items-start gap-2 rounded-lg p-2 transition-colors ${
                    activeSlideId === slide.id ? "bg-primary/10 border-l-2 border-primary" : "hover:bg-muted/40"
                  }`}
                >
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded bg-muted/60 text-[10px] font-medium text-muted-foreground">
                    {index + 1}
                  </span>
                  <button type="button" onClick={() => onSlideClick(slide.id)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-medium">{slide.title || `Slide ${index + 1}`}</span>
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">{LAYOUT_LABELS[slide.layout]}</span>
                  </button>
                  <span className="flex shrink-0 flex-col gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    {onMoveSlide && (
                      <>
                        <button
                          type="button"
                          className="p-0.5 rounded hover:bg-muted"
                          onClick={() => onMoveSlide(slide.id, "up")}
                          disabled={index === 0}
                          aria-label={`Mover slide ${index + 1} para cima`}
                        >
                          <ChevronDown className="size-3 rotate-180" />
                        </button>
                        <button
                          type="button"
                          className="p-0.5 rounded hover:bg-muted"
                          onClick={() => onMoveSlide(slide.id, "down")}
                          disabled={index === slides.length - 1}
                          aria-label={`Mover slide ${index + 1} para baixo`}
                        >
                          <ChevronDown className="size-3" />
                        </button>
                      </>
                    )}
                    {onDuplicateSlide && (
                      <button
                        type="button"
                        className="p-0.5 rounded hover:bg-muted"
                        onClick={() => onDuplicateSlide(slide.id)}
                        aria-label={`Duplicar slide ${index + 1}`}
                      >
                        <Copy className="size-3" />
                      </button>
                    )}
                    {onRemoveSlide && (
                      <button
                        type="button"
                        className="p-0.5 rounded hover:bg-destructive/10 text-destructive"
                        onClick={() => onRemoveSlide(slide.id)}
                        aria-label={`Excluir slide ${index + 1}`}
                      >
                        <Trash2 className="size-3" />
                      </button>
                    )}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2 p-2">
      <div className="flex items-center justify-between gap-1 px-1">
        <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Seções</h4>
        <div className="flex items-center gap-1">
          {onAddTypedSection ? (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="h-6 px-1.5 text-[11px]"
              onClick={() => onAddTypedSection("chapter")}
              aria-label="Adicionar capítulo na estrutura"
            >
              <BookOpen className="size-3 me-1" aria-hidden="true" />
              Capítulo
            </Button>
          ) : null}
          <Button type="button" size="icon-xs" variant="ghost" onClick={onAddSection} aria-label="Adicionar seção">
            <Plus className="size-3.5" />
          </Button>
        </div>
      </div>
      {sections.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
          Nenhuma seção ainda. Use o botão acima para criar a primeira.
        </p>
      ) : (
        <ul className="space-y-1" aria-label="Estrutura do documento">
          {sections.map((section, index) => {
            const isChapter = isChapterSection(section);
            const isSubsection = isSubsectionHeading(section);
            const parentChapterId = hierarchy.parentChapterBySectionId[section.id];
            if (!isChapter && parentChapterId && collapsedChapters[parentChapterId]) {
              return null;
            }

            const Icon = isChapter ? BookOpen : (SECTION_ICONS[section.type] ?? FileText);
            const isChapterCollapsed = isChapter ? (collapsedChapters[section.id] ?? false) : false;
            const childCount = isChapter ? (hierarchy.childCountByChapterId[section.id] ?? 0) : 0;
            const chapterNumber = isChapter ? hierarchy.chapterIndexById[section.id] : undefined;
            const typeLabel = isChapter
              ? `Capítulo ${chapterNumber}`
              : isSubsection
                ? "Subseção"
                : SECTION_LABELS[section.type];

            return (
              <li
                key={section.id}
                data-section-id={section.id}
                data-section-role={isChapter ? "chapter" : parentChapterId ? "chapter-child" : "standalone"}
                className={!isChapter && parentChapterId ? "ps-3 border-s border-border/70 ms-2" : undefined}
              >
                <div
                  className={`group flex items-start gap-2 rounded-lg p-2 transition-colors ${
                    activeSectionId === section.id
                      ? "bg-primary/10 border-l-2 border-primary"
                      : isChapter
                        ? "bg-muted/35 hover:bg-muted/60"
                        : "hover:bg-muted/40"
                  }`}
                >
                  {isChapter ? (
                    <button
                      type="button"
                      className="mt-0.5 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={() =>
                        setCollapsedChapters((current) => ({
                          ...current,
                          [section.id]: !isChapterCollapsed,
                        }))
                      }
                      aria-expanded={!isChapterCollapsed}
                      aria-label={
                        isChapterCollapsed
                          ? `Expandir capítulo ${chapterNumber}`
                          : `Recolher capítulo ${chapterNumber}`
                      }
                    >
                      {isChapterCollapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                    </button>
                  ) : (
                    <GripVertical className="mt-1 size-3.5 shrink-0 text-muted-foreground/60" aria-hidden="true" />
                  )}
                  <Icon
                    className={`mt-0.5 size-3.5 shrink-0 ${isChapter ? "text-primary" : "text-muted-foreground"}`}
                    aria-hidden="true"
                  />
                  <button type="button" onClick={() => onSectionClick(section.id)} className="min-w-0 flex-1 text-left">
                    <div className="flex items-center gap-1.5">
                      <span className={`block truncate text-sm ${isChapter ? "font-semibold text-foreground" : "font-medium"}`}>
                        {section.title || SECTION_LABELS[section.type]}
                      </span>
                      {isChapter ? (
                        <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[9px]">
                          Cap. {chapterNumber}
                        </Badge>
                      ) : null}
                    </div>
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">
                      {typeLabel}
                      {isChapter && childCount > 0 ? ` · ${childCount} ${childCount === 1 ? "bloco" : "blocos"}` : ""}
                      {section.content ? ` · ${section.content.slice(0, 32)}` : ""}
                    </span>
                  </button>
                  <span className="flex shrink-0 flex-col gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    {onMoveSection && (
                      <>
                        <button
                          type="button"
                          className="p-0.5 rounded hover:bg-muted"
                          onClick={() => onMoveSection(section.id, "up")}
                          disabled={index === 0}
                          aria-label={`Mover seção ${index + 1} para cima`}
                        >
                          <ChevronDown className="size-3 rotate-180" />
                        </button>
                        <button
                          type="button"
                          className="p-0.5 rounded hover:bg-muted"
                          onClick={() => onMoveSection(section.id, "down")}
                          disabled={index === sections.length - 1}
                          aria-label={`Mover seção ${index + 1} para baixo`}
                        >
                          <ChevronDown className="size-3" />
                        </button>
                      </>
                    )}
                    {onDuplicateSection && (
                      <button
                        type="button"
                        className="p-0.5 rounded hover:bg-muted"
                        onClick={() => onDuplicateSection(section.id)}
                        aria-label={`Duplicar seção ${index + 1}`}
                      >
                        <Copy className="size-3" />
                      </button>
                    )}
                    {onRemoveSection && (
                      <button
                        type="button"
                        className="p-0.5 rounded hover:bg-destructive/10 text-destructive"
                        onClick={() => onRemoveSection(section.id)}
                        aria-label={`Excluir seção ${index + 1}`}
                      >
                        <Trash2 className="size-3" />
                      </button>
                    )}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
