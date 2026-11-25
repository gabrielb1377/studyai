"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Plus, Trash2, Copy, ChevronLeft, ChevronRight, Layout, Code, Image, Sigma, PenTool, ListChecks, Type, Columns2, SplitSquareHorizontal, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { markdownToSafeHtml } from "../sanitize";
import type { Slide, SlideLayoutType } from "../types";

const LAYOUTS: { id: SlideLayoutType; label: string; icon: typeof Type }[] = [
  { id: "cover", label: "Capa", icon: FileText },
  { id: "title-content", label: "Título e conteúdo", icon: Type },
  { id: "two-column", label: "Duas colunas", icon: Columns2 },
  { id: "comparison", label: "Comparação", icon: SplitSquareHorizontal },
  { id: "image-text", label: "Imagem e texto", icon: Image },
  { id: "diagram", label: "Diagrama", icon: Sigma },
  { id: "code", label: "Código", icon: Code },
  { id: "exercise", label: "Exercício", icon: ListChecks },
  { id: "summary", label: "Resumo", icon: PenTool },
  { id: "blank", label: "Em branco", icon: Layout },
];

const LAYOUT_LABELS: Record<SlideLayoutType, string> = Object.fromEntries(
  LAYOUTS.map((layout) => [layout.id, layout.label]),
) as Record<SlideLayoutType, string>;

interface StudioPresentationEditorProps {
  slides?: Slide[];
  activeSlideId?: string;
  onSlideClick: (id: string) => void;
  onAddSlide: () => void;
  onUpdateSlide: (id: string, updates: Partial<Slide>) => void;
  onRemoveSlide: (id: string) => void;
  onDuplicateSlide: (id: string) => void;
  onReorder: (slideIds: string[]) => void;
  readOnly?: boolean;
}

export function StudioPresentationEditor({
  slides = [],
  activeSlideId,
  onSlideClick,
  onAddSlide,
  onUpdateSlide,
  onRemoveSlide,
  onDuplicateSlide,
  onReorder,
  readOnly = false,
}: StudioPresentationEditorProps) {
  const [draftContent, setDraftContent] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [draftSlideId, setDraftSlideId] = useState<string | undefined>();
  const syncedContent = useRef<string | null>(null);
  const syncedNotes = useRef<string | null>(null);
  const syncedTitle = useRef<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");

  const activeSlide = slides.find((slide) => slide.id === activeSlideId);

  useEffect(() => {
    if (!activeSlide) return;
    const content = activeSlide.content ?? "";
    const notes = activeSlide.presenterNotes ?? "";
    if (draftSlideId !== activeSlide.id) {
      setDraftContent(content);
      setDraftNotes(notes);
      setDraftSlideId(activeSlide.id);
      setTitleDraft(activeSlide.title ?? "");
      syncedContent.current = content;
      syncedNotes.current = notes;
      syncedTitle.current = activeSlide.title ?? "";
      return;
    }
    // Alteração externa (por exemplo, sugestão da IA) enquanto o slide está em foco.
    if (syncedContent.current !== content) {
      syncedContent.current = content;
      if (draftContent !== content) setDraftContent(content);
    }
    if (syncedNotes.current !== notes) {
      syncedNotes.current = notes;
      if (draftNotes !== notes) setDraftNotes(notes);
    }
    const currentTitle = activeSlide.title ?? "";
    if (syncedTitle.current !== currentTitle) {
      syncedTitle.current = currentTitle;
      if (titleDraft !== currentTitle) setTitleDraft(currentTitle);
    }
  }, [activeSlide, draftSlideId, draftContent, draftNotes, titleDraft]);

  const commitContent = useCallback(() => {
    if (!draftSlideId) return;
    onUpdateSlide(draftSlideId, { content: draftContent });
  }, [draftContent, draftSlideId, onUpdateSlide]);

  const commitNotes = useCallback(() => {
    if (!draftSlideId) return;
    onUpdateSlide(draftSlideId, { presenterNotes: draftNotes });
  }, [draftNotes, draftSlideId, onUpdateSlide]);

  const handleMove = useCallback((id: string, direction: "up" | "down") => {
    const ids = slides.map((slide) => slide.id);
    const index = ids.indexOf(id);
    if (index === -1) return;
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    onReorder(ids);
  }, [slides, onReorder]);

  const activeIndex = activeSlide ? slides.findIndex((slide) => slide.id === activeSlide.id) : -1;

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {activeSlide && (
        <div className="space-y-3 border-b p-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              Título do slide
              <Input
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                onBlur={() => onUpdateSlide(activeSlide.id, { title: titleDraft })}
                disabled={readOnly}
                placeholder="Título"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              Layout
              <Select
                value={activeSlide.layout}
                onValueChange={(value) => onUpdateSlide(activeSlide.id, { layout: value as SlideLayoutType })}
                options={LAYOUTS.map((layout) => ({ value: layout.id, label: layout.label }))}
                disabled={readOnly}
                aria-label="Layout do slide"
                className="h-9"
              />
            </label>
          </div>

          <label className="block space-y-1 text-xs font-medium text-muted-foreground">
            Conteúdo do slide
            <Textarea
              value={draftSlideId === activeSlide.id ? draftContent : activeSlide.content}
              onChange={(event) => {
                setDraftSlideId(activeSlide.id);
                setDraftContent(event.target.value);
              }}
              onBlur={commitContent}
              rows={7}
              disabled={readOnly}
              placeholder="Conteúdo em Markdown. Use listas, tabelas e blocos de código."
              className="text-sm leading-6"
            />
          </label>

          <label className="block space-y-1 text-xs font-medium text-muted-foreground">
            Notas do apresentador
            <Textarea
              value={draftSlideId === activeSlide.id ? draftNotes : activeSlide.presenterNotes ?? ""}
              onChange={(event) => {
                setDraftSlideId(activeSlide.id);
                setDraftNotes(event.target.value);
              }}
              onBlur={commitNotes}
              rows={3}
              disabled={readOnly}
              placeholder="Orientações para quem apresenta este slide"
              className="text-sm"
            />
          </label>

          {!readOnly && (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => handleMove(activeSlide.id, "up")} disabled={activeIndex === 0}>
                <ChevronLeft className="size-3.5 rotate-90" aria-hidden="true" /> Mover para cima
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => handleMove(activeSlide.id, "down")} disabled={activeIndex === slides.length - 1}>
                <ChevronRight className="size-3.5 rotate-90" aria-hidden="true" /> Mover para baixo
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => onDuplicateSlide(activeSlide.id)}>
                <Copy className="size-3.5 me-1" /> Duplicar
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => onRemoveSlide(activeSlide.id)}>
                <Trash2 className="size-3.5 me-1 text-destructive" /> Excluir
              </Button>
              <span className="ml-auto text-[11px] text-muted-foreground">
                Slide {activeIndex + 1} de {slides.length} · {LAYOUT_LABELS[activeSlide.layout]}
              </span>
            </div>
          )}
        </div>
      )}

      <ScrollArea className="flex-1 p-4">
        {slides.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center">
            <div>
              <p className="text-sm text-muted-foreground">Nenhum slide criado.</p>
              {!readOnly && (
                <Button type="button" className="mt-3" onClick={onAddSlide}>
                  <Plus className="size-3.5 me-1" /> Criar primeiro slide
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-4">
            {slides.map((slide, index) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => onSlideClick(slide.id)}
                className={`block w-full rounded-xl border p-4 text-left transition-colors ${
                  slide.id === activeSlideId ? "border-primary bg-primary/5" : "hover:bg-muted/30"
                }`}
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex size-5 items-center justify-center rounded bg-muted/60 text-[10px] font-medium text-muted-foreground">
                    {index + 1}
                  </span>
                  <span className="text-sm font-semibold">{slide.title || `Slide ${index + 1}`}</span>
                  <Badge variant="outline" className="ml-auto text-[10px]">
                    {LAYOUT_LABELS[slide.layout]}
                  </Badge>
                </div>
                <div
                  className="studio-content line-clamp-3 max-w-none text-sm leading-6 text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: markdownToSafeHtml(slide.content) }}
                />
              </button>
            ))}
            {!readOnly && (
              <Button type="button" variant="outline" className="w-full" onClick={onAddSlide}>
                <Plus className="size-3.5 me-1" /> Adicionar slide
              </Button>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
