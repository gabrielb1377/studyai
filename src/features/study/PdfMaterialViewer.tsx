"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Highlighter, History, Link2, List, MessageSquare, Minus, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Document, Page, pdfjs } from "react-pdf";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { StudyMaterial } from "@/types/study";
import { WorkspacePersistence, type PdfAnnotation, type PdfAnnotationKind } from "./services/WorkspacePersistence";

import "react-pdf/dist/esm/Page/TextLayer.css";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

function LazyThumbnail({ page }: { page: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(page <= 3);

  useEffect(() => {
    if (visible || !containerRef.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setVisible(true);
      observer.disconnect();
    }, { rootMargin: "160px" });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div ref={containerRef} className="flex min-h-28 items-center justify-center bg-muted/30">
      {visible ? <Page pageNumber={page} width={110} renderTextLayer={false} renderAnnotationLayer={false} loading={null} /> : <span className="text-[10px] text-muted-foreground">Página {page}</span>}
    </div>
  );
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function highlighted(value: string, query: string) {
  const normalized = value.toLocaleLowerCase("pt-BR");
  let cursor = 0;
  let output = "";
  while (cursor < value.length) {
    const index = normalized.indexOf(query, cursor);
    if (index < 0) {
      output += escapeHtml(value.slice(cursor));
      break;
    }
    output += escapeHtml(value.slice(cursor, index));
    output += `<mark class="rounded-sm bg-yellow-300/80 text-black">${escapeHtml(value.slice(index, index + query.length))}</mark>`;
    cursor = index + Math.max(1, query.length);
  }
  return output;
}

export default function PdfMaterialViewer({ material, studyId, compact = false }: { material: StudyMaterial; studyId: string; compact?: boolean }) {
  const stored = WorkspacePersistence.load(studyId).pdf[material.id];
  const [pageNumber, setPageNumber] = useState(stored?.page ?? 1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(stored?.zoom ?? 1);
  const [chapterIndex, setChapterIndex] = useState(stored?.chapterIndex ?? 0);
  const [bookmarks, setBookmarks] = useState<number[]>(stored?.bookmarks ?? []);
  const [annotations, setAnnotations] = useState<PdfAnnotation[]>(stored?.annotations ?? []);
  const [pageHistory, setPageHistory] = useState<number[]>(stored?.pageHistory ?? []);
  const [annotationMode, setAnnotationMode] = useState<PdfAnnotationKind | null>(null);
  const [annotationColor, setAnnotationColor] = useState("#facc15");
  const [annotationText, setAnnotationText] = useState("");
  const [linkTarget, setLinkTarget] = useState(1);
  const [draftPath, setDraftPath] = useState<Array<{ x: number; y: number }>>([]);
  const [query, setQuery] = useState("");
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [searchResults, setSearchResults] = useState<Array<{ page: number; occurrence: number }>>([]);
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const pageTextCache = useRef(new Map<number, string>());
  const pageSurfaceRef = useRef<HTMLDivElement>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");

  useEffect(() => {
    WorkspacePersistence.savePdf(studyId, material.id, {
      page: pageNumber,
      zoom: scale,
      chapterIndex,
      bookmarks,
      annotations,
      pageHistory,
    });
  }, [annotations, bookmarks, chapterIndex, material.id, pageHistory, pageNumber, scale, studyId]);

  useEffect(() => {
    const chapter = material.chapters?.[chapterIndex]?.title;
    const timeout = globalThis.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("studyai:workspace-chapter", { detail: { studyId, chapter } }));
    }, 0);
    return () => globalThis.clearTimeout(timeout);
  }, [chapterIndex, material.chapters, studyId]);

  useEffect(() => {
    const handleSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "f") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleSearch);
    return () => window.removeEventListener("keydown", handleSearch);
  }, []);

  useEffect(() => {
    const openChapter = (event: Event) => {
      const detail = (event as CustomEvent<{ materialId?: string; chapterIndex?: number; page?: number }>).detail;
      if (detail?.materialId !== material.id) return;
      if (typeof detail.chapterIndex === "number") setChapterIndex(Math.max(0, detail.chapterIndex));
      if (typeof detail.page === "number") {
        const target = Math.min(Math.max(1, detail.page), Math.max(1, numPages));
        setPageNumber((current) => {
          if (current !== target) setPageHistory((history) => [...history.slice(-49), current]);
          return target;
        });
      }
    };
    window.addEventListener("studyai:pdf-chapter", openChapter);
    return () => window.removeEventListener("studyai:pdf-chapter", openChapter);
  }, [material.id, numPages]);

  useEffect(() => {
    let cancelled = false;
    if (!pdfDocument || !normalizedQuery) {
      setSearchResults([]);
      setActiveSearchIndex(0);
      return () => { cancelled = true; };
    }

    const timeout = window.setTimeout(() => { void (async () => {
      const results: Array<{ page: number; occurrence: number }> = [];
      for (let page = 1; page <= pdfDocument.numPages; page += 1) {
        let text = pageTextCache.current.get(page);
        if (text === undefined) {
          const pdfPage = await pdfDocument.getPage(page);
          const content = await pdfPage.getTextContent();
          text = content.items.map((item) => "str" in item ? item.str : "").join(" ").toLocaleLowerCase("pt-BR");
          pageTextCache.current.set(page, text);
        }
        let from = 0;
        let occurrence = 0;
        while ((from = text.indexOf(normalizedQuery, from)) >= 0) {
          results.push({ page, occurrence });
          occurrence += 1;
          from += Math.max(1, normalizedQuery.length);
        }
      }
      if (!cancelled) {
        setSearchResults(results);
        setActiveSearchIndex(0);
        if (results[0]) setPageNumber(results[0].page);
      }
    })(); }, 200);
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [normalizedQuery, pdfDocument]);

  useEffect(() => {
    document.getElementById(`pdf-thumbnail-${material.id}-${pageNumber}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [material.id, pageNumber]);

  const highlightText = useMemo(() => {
    if (!normalizedQuery) return undefined;
    return ({ str }: { str: string }) => highlighted(str, normalizedQuery);
  }, [normalizedQuery]);

  const navigateResult = (direction: -1 | 1) => {
    if (searchResults.length === 0) return;
    const next = (activeSearchIndex + direction + searchResults.length) % searchResults.length;
    setActiveSearchIndex(next);
    setPageNumber(searchResults[next].page);
  };

  const toggleBookmark = () => setBookmarks((current) => current.includes(pageNumber)
    ? current.filter((page) => page !== pageNumber)
    : [...current, pageNumber].sort((left, right) => left - right));

  const goToPage = (target: number, remember = true) => {
    const next = Math.min(Math.max(1, target), Math.max(1, numPages));
    if (next === pageNumber) return;
    if (remember) setPageHistory((current) => [...current.slice(-49), pageNumber]);
    setPageNumber(next);
  };

  const goBack = () => setPageHistory((current) => {
    const previous = current.at(-1);
    if (previous) setPageNumber(previous);
    return current.slice(0, -1);
  });

  const relativePoint = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = pageSurfaceRef.current?.getBoundingClientRect();
    if (!bounds) return null;
    return { x: ((event.clientX - bounds.left) / bounds.width) * 100, y: ((event.clientY - bounds.top) / bounds.height) * 100 };
  };

  const addPointAnnotation = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!annotationMode || annotationMode === "drawing") return;
    const point = relativePoint(event);
    if (!point) return;
    const annotation: PdfAnnotation = {
      id: crypto.randomUUID(), kind: annotationMode, page: pageNumber, color: annotationColor,
      x: point.x, y: point.y, width: annotationMode === "highlight" ? 18 : undefined,
      height: annotationMode === "highlight" ? 3.5 : undefined,
      text: annotationMode === "comment" ? annotationText.trim() || "Comentário" : undefined,
      targetPage: annotationMode === "link" ? Math.min(Math.max(1, linkTarget), Math.max(1, numPages)) : undefined,
      createdAt: new Date().toISOString(),
    };
    setAnnotations((current) => [...current, annotation]);
  };

  const finishDrawing = () => {
    if (annotationMode !== "drawing" || draftPath.length < 2) return setDraftPath([]);
    setAnnotations((current) => [...current, { id: crypto.randomUUID(), kind: "drawing", page: pageNumber, color: annotationColor, points: draftPath, createdAt: new Date().toISOString() }]);
    setDraftPath([]);
  };

  const pageAnnotations = annotations.filter((annotation) => annotation.page === pageNumber);

  return (
    <div className="overflow-hidden rounded-xl border bg-muted/40">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-3 py-2.5 sm:px-4">
        <p className="text-xs font-medium text-muted-foreground">Leitor de PDF</p>
        <label className="relative min-w-44 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input ref={searchRef} aria-label="Buscar no PDF" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar (Ctrl+F)" className="h-8 pl-8 pr-20 text-xs" />
          {query && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{searchResults.length ? `${activeSearchIndex + 1}/${searchResults.length}` : "0 resultados"}</span>}
        </label>
        {query && <div className="flex items-center gap-1"><Button type="button" variant="ghost" size="icon-sm" aria-label="Ocorrência anterior" onClick={() => navigateResult(-1)} disabled={searchResults.length === 0}><ChevronUp /></Button><Button type="button" variant="ghost" size="icon-sm" aria-label="Próxima ocorrência" onClick={() => navigateResult(1)} disabled={searchResults.length === 0}><ChevronDown /></Button></div>}
        <div className="flex items-center gap-1">
          <Button type="button" variant={annotationMode === "highlight" ? "secondary" : "ghost"} size="icon-sm" aria-label="Marca-texto" onClick={() => setAnnotationMode((current) => current === "highlight" ? null : "highlight")}><Highlighter /></Button>
          <Button type="button" variant={annotationMode === "comment" ? "secondary" : "ghost"} size="icon-sm" aria-label="Adicionar comentário" onClick={() => setAnnotationMode((current) => current === "comment" ? null : "comment")}><MessageSquare /></Button>
          <Button type="button" variant={annotationMode === "drawing" ? "secondary" : "ghost"} size="icon-sm" aria-label="Desenhar no PDF" onClick={() => setAnnotationMode((current) => current === "drawing" ? null : "drawing")}><Pencil /></Button>
          <Button type="button" variant={annotationMode === "link" ? "secondary" : "ghost"} size="icon-sm" aria-label="Adicionar link interno" onClick={() => setAnnotationMode((current) => current === "link" ? null : "link")}><Link2 /></Button>
          <label className="flex size-8 cursor-pointer items-center justify-center rounded-md hover:bg-accent" title="Cor da marcação"><span className="size-4 rounded-full border" style={{ backgroundColor: annotationColor }} /><input className="sr-only" type="color" aria-label="Cor da anotação" value={annotationColor} onChange={(event) => setAnnotationColor(event.target.value)} /></label>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Voltar à página visitada" onClick={goBack} disabled={pageHistory.length === 0}><History /></Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Remover última anotação da página" onClick={() => setAnnotations((current) => { const index = current.findLastIndex((item) => item.page === pageNumber); return index < 0 ? current : current.filter((_, itemIndex) => itemIndex !== index); })} disabled={pageAnnotations.length === 0}><Trash2 /></Button>
          <Button type="button" variant={bookmarks.includes(pageNumber) ? "secondary" : "ghost"} size="icon-sm" aria-label={bookmarks.includes(pageNumber) ? "Remover marcador da página" : "Marcar página"} onClick={toggleBookmark}>
            <Bookmark className={bookmarks.includes(pageNumber) ? "fill-current" : undefined} />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Diminuir zoom do PDF" onClick={() => setScale((current) => Math.max(0.6, current - 0.1))} disabled={scale <= 0.6}><Minus /></Button>
          <span className="min-w-12 text-center text-xs text-muted-foreground" aria-label="Zoom atual">{Math.round(scale * 100)}%</span>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Aumentar zoom do PDF" onClick={() => setScale((current) => Math.min(1.6, current + 0.1))} disabled={scale >= 1.6}><Plus /></Button>
        </div>
      </div>
      {(annotationMode === "comment" || annotationMode === "link") && <div className="flex flex-wrap items-center gap-2 border-b bg-card px-3 py-2 text-xs"><span className="text-muted-foreground">Clique sobre a página para inserir.</span>{annotationMode === "comment" ? <Input aria-label="Texto do comentário" value={annotationText} onChange={(event) => setAnnotationText(event.target.value)} placeholder="Comentário" className="h-8 max-w-xs" /> : <Input aria-label="Página de destino do link" type="number" min={1} max={Math.max(1, numPages)} value={linkTarget} onChange={(event) => setLinkTarget(Number(event.target.value))} className="h-8 w-24" />}</div>}
      <Document
        file={material.source}
        loading={<p className="flex min-h-[360px] items-center justify-center text-sm text-muted-foreground">Carregando PDF...</p>}
        error={<p role="alert" className="flex min-h-[360px] items-center justify-center text-sm text-destructive">Não foi possível carregar este PDF.</p>}
        onLoadSuccess={(document) => {
          const pages = document.numPages;
          setPdfDocument(document);
          setNumPages(pages);
          setPageNumber((current) => Math.min(Math.max(1, current), pages));
        }}
      >
        <div className={`grid min-h-[360px] ${compact ? "grid-rows-[auto_minmax(0,1fr)]" : "lg:grid-cols-[11rem_minmax(0,1fr)]"}`}>
          <aside className={`overflow-y-auto border-b bg-card p-3 ${compact ? "max-h-44" : "max-h-[620px] lg:border-b-0 lg:border-r"}`} aria-label="Índice e miniaturas do PDF">
            {material.chapters?.length ? (
              <div className="mb-4">
                <p className="mb-2 flex items-center gap-2 text-xs font-semibold"><List className="size-3.5" />Índice</p>
                <div className="space-y-1">
                  {material.chapters.map((chapter, index) => (
                    <button key={chapter.id} type="button" className={`w-full rounded px-2 py-1.5 text-left text-[11px] ${chapterIndex === index ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent/60"}`} onClick={() => { setChapterIndex(index); if (chapter.page) goToPage(chapter.page); }}>
                      {chapter.title}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <p className="mb-2 text-xs font-semibold">Miniaturas</p>
            <div className={`grid gap-2 ${compact ? "grid-flow-col auto-cols-[7rem] overflow-x-auto" : "grid-cols-2 lg:grid-cols-1"}`}>
              {Array.from({ length: numPages }, (_, index) => index + 1).map((page) => (
                <button id={`pdf-thumbnail-${material.id}-${page}`} key={page} type="button" aria-label={`Abrir miniatura da página ${page}`} className={`relative overflow-hidden rounded border p-1 ${pageNumber === page ? "border-primary ring-1 ring-primary" : "hover:border-primary/40"}`} onClick={() => goToPage(page)}>
                  <LazyThumbnail page={page} />
                  <span className="absolute bottom-1 right-1 rounded bg-background/90 px-1 text-[9px]">{page}{bookmarks.includes(page) ? " ★" : ""}</span>
                </button>
              ))}
            </div>
          </aside>
          <div className={`flex max-h-[620px] overflow-auto p-4 sm:p-8 ${compact ? "justify-start" : "justify-center"}`}>
            <div ref={pageSurfaceRef} className="relative h-fit w-fit shadow-lg">
              <Page pageNumber={pageNumber} scale={scale} renderTextLayer renderAnnotationLayer customTextRenderer={highlightText} className="max-w-full" />
              <div data-testid="pdf-annotation-layer" className={`absolute inset-0 z-20 ${annotationMode ? "cursor-crosshair" : "pointer-events-none"}`} onClick={addPointAnnotation} onPointerDown={(event) => { if (annotationMode !== "drawing") return; event.currentTarget.setPointerCapture(event.pointerId); const point = relativePoint(event); if (point) setDraftPath([point]); }} onPointerMove={(event) => { if (annotationMode !== "drawing" || !event.currentTarget.hasPointerCapture(event.pointerId)) return; const point = relativePoint(event); if (point) setDraftPath((current) => [...current, point]); }} onPointerUp={finishDrawing}>
                {pageAnnotations.map((annotation) => annotation.kind === "drawing" ? <svg key={annotation.id} className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points={annotation.points?.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke={annotation.color} strokeWidth="0.45" vectorEffect="non-scaling-stroke" /></svg> : annotation.kind === "highlight" ? <span key={annotation.id} title="Marca-texto" className="pointer-events-none absolute rounded-sm opacity-45 mix-blend-multiply" style={{ left: `${annotation.x}%`, top: `${annotation.y}%`, width: `${annotation.width}%`, height: `${annotation.height}%`, backgroundColor: annotation.color, transform: "translate(-4%, -50%)" }} /> : <button key={annotation.id} type="button" className="absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-background shadow" style={{ left: `${annotation.x}%`, top: `${annotation.y}%`, color: annotation.color }} title={annotation.kind === "comment" ? annotation.text : `Ir para página ${annotation.targetPage}`} onClick={(event) => { event.stopPropagation(); if (annotation.kind === "link" && annotation.targetPage) goToPage(annotation.targetPage); }}>{annotation.kind === "comment" ? <MessageSquare className="size-3.5" /> : <Link2 className="size-3.5" />}</button>)}
                {draftPath.length > 1 && <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points={draftPath.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke={annotationColor} strokeWidth="0.45" vectorEffect="non-scaling-stroke" /></svg>}
              </div>
            </div>
          </div>
        </div>
      </Document>
      <div className="flex items-center justify-center gap-3 border-t bg-card px-3 py-2.5">
        <Button type="button" variant="outline" size="sm" aria-label="Página anterior do PDF" onClick={() => goToPage(pageNumber - 1)} disabled={pageNumber <= 1}><ChevronLeft />Anterior</Button>
        <span className="min-w-24 text-center text-xs text-muted-foreground" aria-label="Página atual do PDF">Página {pageNumber} de {numPages || "—"}</span>
        <Button type="button" variant="outline" size="sm" aria-label="Próxima página do PDF" onClick={() => goToPage(pageNumber + 1)} disabled={!numPages || pageNumber >= numPages}>Próxima<ChevronRight /></Button>
      </div>
    </div>
  );
}
