"use client";

import { useState } from "react";
import { Plus, Trash2, GripVertical, Copy, ChevronDown, ChevronRight, FileText, List, Code, Table, Lightbulb, PenLine, ListChecks, Sigma, Quote, Heading } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DocumentSection, Slide } from "../types";

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
  onAddSlide,
  onRemoveSection,
  onDuplicateSection,
  onRemoveSlide,
  onDuplicateSlide,
  onMoveSection,
  onMoveSlide,
}: StudioDocumentSidebarProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

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
      <div className="flex items-center justify-between px-1">
        <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Seções</h4>
        <Button type="button" size="icon-xs" variant="ghost" onClick={onAddSection} aria-label="Adicionar seção">
          <Plus className="size-3.5" />
        </Button>
      </div>
      {sections.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
          Nenhuma seção ainda. Use o botão acima para criar a primeira.
        </p>
      ) : (
        <ul className="space-y-1">
          {sections.map((section, index) => {
            const Icon = SECTION_ICONS[section.type] ?? FileText;
            const isCollapsed = collapsed[section.id] ?? false;
            return (
              <li key={section.id}>
                <div
                  className={`group flex items-start gap-2 rounded-lg p-2 transition-colors ${
                    activeSectionId === section.id ? "bg-primary/10 border-l-2 border-primary" : "hover:bg-muted/40"
                  }`}
                >
                  <GripVertical className="mt-1 size-3.5 shrink-0 text-muted-foreground/60" aria-hidden="true" />
                  <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <button type="button" onClick={() => onSectionClick(section.id)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-medium">{section.title || SECTION_LABELS[section.type]}</span>
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">
                      {SECTION_LABELS[section.type]}
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
                    <button
                      type="button"
                      className="p-0.5 rounded hover:bg-muted"
                      onClick={() => setCollapsed((current) => ({ ...current, [section.id]: !isCollapsed }))}
                      aria-label={isCollapsed ? "Expandir seção" : "Recolher seção"}
                    >
                      {isCollapsed ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
                    </button>
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
