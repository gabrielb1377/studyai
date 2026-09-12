"use client";

import dynamic from "next/dynamic";
import { AudioLines, ChevronLeft, ChevronRight, FileText, Headphones, ImageIcon, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatFileSize } from "@/features/import/import-utils";
import type { StudyMaterial } from "@/types/study";

const PdfMaterialViewer = dynamic(() => import("./PdfMaterialViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[360px] items-center justify-center rounded-xl border bg-muted/40 text-sm text-muted-foreground">
      Preparando o leitor de PDF...
    </div>
  ),
});

const materialIcons = {
  pdf: FileText,
  video: Video,
  audio: Headphones,
  text: FileText,
  document: FileText,
  image: ImageIcon,
};

export function MaterialViewer({
  material,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
}: {
  material: StudyMaterial;
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
}) {
  const Icon = materialIcons[material.type];

  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none">
      <CardHeader className="gap-4 border-b px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
              <Icon className="size-5" strokeWidth={1.5} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <CardTitle className="truncate text-base">{material.name}</CardTitle>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-normal text-muted-foreground">{material.type.toUpperCase()}</Badge>
                <span className="text-xs text-muted-foreground">{formatFileSize(material.size)}</span>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onPrevious} disabled={!hasPrevious}>
              <ChevronLeft aria-hidden="true" />
              Anterior
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onNext} disabled={!hasNext}>
              Próximo
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-6">
        {material.type === "pdf" && material.source && <PdfMaterialViewer material={material} />}
        {material.type === "pdf" && !material.source && (
          <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
            O arquivo original não permanece no navegador após recarregar a página. Importe-o novamente para abrir o PDF.
            {material.textContent && <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-secondary/40 p-4 text-foreground">{material.textContent}</pre>}
          </div>
        )}
        {material.type === "video" && (
          <div className="overflow-hidden rounded-xl border bg-black/90">
            <video controls className="aspect-video w-full" aria-label={`Player de vídeo: ${material.name}`}>
              {material.source && <source src={material.source} type="video/mp4" />}
            </video>
            {!material.source && <p className="px-4 py-3 text-center text-xs text-white/60">Reimporte o arquivo para reproduzi-lo nesta sessão.</p>}
          </div>
        )}
        {material.type === "audio" && (
          <div className="rounded-xl border bg-secondary/40 p-5 sm:p-8">
            <div className="mb-5 flex items-center gap-3">
              <span className="flex size-12 items-center justify-center rounded-xl bg-card text-primary shadow-sm"><AudioLines className="size-6" aria-hidden="true" /></span>
              <div><p className="text-sm font-medium">Player de áudio</p><p className="text-xs text-muted-foreground">{material.source ? "Arquivo importado" : "Reimporte para reproduzir"}</p></div>
            </div>
            <audio controls className="w-full" aria-label={`Player de áudio: ${material.name}`}>
              {material.source && <source src={material.source} type={material.mimeType} />}
            </audio>
          </div>
        )}
        {(material.type === "text" || material.type === "document") && (
          <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap rounded-xl border bg-secondary/30 p-5 text-sm leading-7 text-foreground sm:p-7">
            {material.textContent || "Nenhum texto foi extraído deste material."}
          </pre>
        )}
        {material.type === "image" && material.source && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={material.source} alt={material.name} className="mx-auto max-h-[620px] rounded-xl object-contain" />
        )}
        {material.type === "image" && !material.source && (
          <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Reimporte a imagem para visualizá-la nesta sessão.</p>
        )}
      </CardContent>
    </Card>
  );
}
