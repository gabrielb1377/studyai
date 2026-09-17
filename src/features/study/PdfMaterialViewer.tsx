"use client";

import { useEffect, useRef, useState } from "react";
import { Bookmark, ChevronLeft, ChevronRight, List, Minus, Plus, Search } from "lucide-react";
import { Document, Page, pdfjs } from "react-pdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { StudyMaterial } from "@/types/study";
import { WorkspacePersistence } from "./services/WorkspacePersistence";

import "react-pdf/dist/esm/Page/TextLayer.css";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export default function PdfMaterialViewer({ material, studyId }: { material: StudyMaterial; studyId: string }) {
  const stored = WorkspacePersistence.load(studyId).pdf[material.id];
  const [pageNumber, setPageNumber] = useState(stored?.page ?? 1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(stored?.zoom ?? 1);
  const [chapterIndex, setChapterIndex] = useState(stored?.chapterIndex ?? 0);
  const [bookmarks, setBookmarks] = useState<number[]>(stored?.bookmarks ?? []);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const matches = query.trim()
    ? (material.textContent?.toLocaleLowerCase("pt-BR").split(query.trim().toLocaleLowerCase("pt-BR")).length ?? 1) - 1
    : 0;

  useEffect(() => {
    WorkspacePersistence.savePdf(studyId, material.id, {
      page: pageNumber,
      zoom: scale,
      chapterIndex,
      bookmarks,
    });
  }, [bookmarks, chapterIndex, material.id, pageNumber, scale, studyId]);

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

  const toggleBookmark = () => setBookmarks((current) => current.includes(pageNumber)
    ? current.filter((page) => page !== pageNumber)
    : [...current, pageNumber].sort((left, right) => left - right));

  return (
    <div className="overflow-hidden rounded-xl border bg-muted/40">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-3 py-2.5 sm:px-4">
        <p className="text-xs font-medium text-muted-foreground">Leitor de PDF</p>
        <label className="relative min-w-44 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input ref={searchRef} aria-label="Buscar no PDF" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar (Ctrl+F)" className="h-8 pl-8 pr-20 text-xs" />
          {query && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{matches} resultados</span>}
        </label>
        <div className="flex items-center gap-1">
          <Button type="button" variant={bookmarks.includes(pageNumber) ? "secondary" : "ghost"} size="icon-sm" aria-label={bookmarks.includes(pageNumber) ? "Remover marcador da página" : "Marcar página"} onClick={toggleBookmark}>
            <Bookmark className={bookmarks.includes(pageNumber) ? "fill-current" : undefined} />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Diminuir zoom do PDF" onClick={() => setScale((current) => Math.max(0.6, current - 0.1))} disabled={scale <= 0.6}><Minus /></Button>
          <span className="min-w-12 text-center text-xs text-muted-foreground" aria-label="Zoom atual">{Math.round(scale * 100)}%</span>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Aumentar zoom do PDF" onClick={() => setScale((current) => Math.min(1.6, current + 0.1))} disabled={scale >= 1.6}><Plus /></Button>
        </div>
      </div>
      <Document
        file={material.source}
        loading={<p className="flex min-h-[360px] items-center justify-center text-sm text-muted-foreground">Carregando PDF...</p>}
        error={<p role="alert" className="flex min-h-[360px] items-center justify-center text-sm text-destructive">Não foi possível carregar este PDF.</p>}
        onLoadSuccess={({ numPages: pages }) => {
          setNumPages(pages);
          setPageNumber((current) => Math.min(Math.max(1, current), pages));
        }}
      >
        <div className="grid min-h-[360px] lg:grid-cols-[11rem_minmax(0,1fr)]">
          <aside className="max-h-[620px] overflow-y-auto border-b bg-card p-3 lg:border-b-0 lg:border-r" aria-label="Índice e miniaturas do PDF">
            {material.chapters?.length ? (
              <div className="mb-4">
                <p className="mb-2 flex items-center gap-2 text-xs font-semibold"><List className="size-3.5" />Índice</p>
                <div className="space-y-1">
                  {material.chapters.map((chapter, index) => (
                    <button key={chapter.id} type="button" className={`w-full rounded px-2 py-1.5 text-left text-[11px] ${chapterIndex === index ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent/60"}`} onClick={() => { setChapterIndex(index); if (chapter.page) setPageNumber(chapter.page); }}>
                      {chapter.title}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <p className="mb-2 text-xs font-semibold">Miniaturas</p>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
              {Array.from({ length: numPages }, (_, index) => index + 1).map((page) => (
                <button key={page} type="button" aria-label={`Abrir miniatura da página ${page}`} className={`relative overflow-hidden rounded border p-1 ${pageNumber === page ? "border-primary ring-1 ring-primary" : "hover:border-primary/40"}`} onClick={() => setPageNumber(page)}>
                  <Page pageNumber={page} width={110} renderTextLayer={false} renderAnnotationLayer={false} loading={null} />
                  <span className="absolute bottom-1 right-1 rounded bg-background/90 px-1 text-[9px]">{page}{bookmarks.includes(page) ? " ★" : ""}</span>
                </button>
              ))}
            </div>
          </aside>
          <div className="flex max-h-[620px] justify-center overflow-auto p-4 sm:p-8">
            <Page pageNumber={pageNumber} scale={scale} renderTextLayer renderAnnotationLayer className="max-w-full shadow-lg" />
          </div>
        </div>
      </Document>
      <div className="flex items-center justify-center gap-3 border-t bg-card px-3 py-2.5">
        <Button type="button" variant="outline" size="sm" aria-label="Página anterior do PDF" onClick={() => setPageNumber((current) => Math.max(1, current - 1))} disabled={pageNumber <= 1}><ChevronLeft />Anterior</Button>
        <span className="min-w-24 text-center text-xs text-muted-foreground" aria-label="Página atual do PDF">Página {pageNumber} de {numPages || "—"}</span>
        <Button type="button" variant="outline" size="sm" aria-label="Próxima página do PDF" onClick={() => setPageNumber((current) => Math.min(numPages, current + 1))} disabled={!numPages || pageNumber >= numPages}>Próxima<ChevronRight /></Button>
      </div>
    </div>
  );
}
