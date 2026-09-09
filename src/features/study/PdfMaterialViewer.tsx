"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { Document, Page, pdfjs } from "react-pdf";
import { Button } from "@/components/ui/button";
import type { StudyMaterial } from "@/types/study";

import "react-pdf/dist/esm/Page/TextLayer.css";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export default function PdfMaterialViewer({ material }: { material: StudyMaterial }) {
  const [pageNumber, setPageNumber] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1);

  return (
    <div className="overflow-hidden rounded-xl border bg-muted/40">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-3 py-2.5 sm:px-4">
        <p className="text-xs font-medium text-muted-foreground">Leitor de PDF</p>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Diminuir zoom do PDF"
            onClick={() => setScale((current) => Math.max(0.6, current - 0.1))}
            disabled={scale <= 0.6}
          >
            <Minus aria-hidden="true" />
          </Button>
          <span className="min-w-12 text-center text-xs text-muted-foreground" aria-label="Zoom atual">
            {Math.round(scale * 100)}%
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Aumentar zoom do PDF"
            onClick={() => setScale((current) => Math.min(1.6, current + 0.1))}
            disabled={scale >= 1.6}
          >
            <Plus aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div className="flex min-h-[360px] justify-center overflow-auto p-4 sm:p-8">
        <Document
          file={material.source}
          loading={<p className="self-center text-sm text-muted-foreground">Carregando PDF...</p>}
          error={<p role="alert" className="self-center text-sm text-destructive">Não foi possível carregar este PDF mockado.</p>}
          onLoadSuccess={({ numPages: pages }) => {
            setNumPages(pages);
            setPageNumber((current) => Math.min(current, pages));
          }}
        >
          <Page
            pageNumber={pageNumber}
            scale={scale}
            renderTextLayer
            renderAnnotationLayer
            className="max-w-full shadow-lg"
          />
        </Document>
      </div>
      <div className="flex items-center justify-center gap-3 border-t bg-card px-3 py-2.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="Página anterior do PDF"
          onClick={() => setPageNumber((current) => Math.max(1, current - 1))}
          disabled={pageNumber <= 1}
        >
          <ChevronLeft aria-hidden="true" />
          Anterior
        </Button>
        <span className="min-w-24 text-center text-xs text-muted-foreground" aria-label="Página atual do PDF">
          Página {pageNumber} de {numPages || "—"}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="Próxima página do PDF"
          onClick={() => setPageNumber((current) => Math.min(numPages, current + 1))}
          disabled={!numPages || pageNumber >= numPages}
        >
          Próxima
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
