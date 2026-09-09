"use client";

import dynamic from "next/dynamic";
import { AudioLines, ChevronLeft, ChevronRight, FileText, Headphones, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  txt: FileText,
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
                <Badge variant="outline" className="font-normal text-muted-foreground">{material.label}</Badge>
                <span className="text-xs text-muted-foreground">{material.size}</span>
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
        {material.type === "pdf" && <PdfMaterialViewer material={material} />}
        {material.type === "video" && (
          <div className="overflow-hidden rounded-xl border bg-black/90">
            <video controls className="aspect-video w-full" aria-label={`Player de vídeo: ${material.name}`} data-mock-player>
              {material.source && <source src={material.source} type="video/mp4" />}
            </video>
            <p className="px-4 py-3 text-center text-xs text-white/60">Player de vídeo mockado — o arquivo será conectado futuramente.</p>
          </div>
        )}
        {material.type === "audio" && (
          <div className="rounded-xl border bg-secondary/40 p-5 sm:p-8">
            <div className="mb-5 flex items-center gap-3">
              <span className="flex size-12 items-center justify-center rounded-xl bg-card text-primary shadow-sm"><AudioLines className="size-6" aria-hidden="true" /></span>
              <div><p className="text-sm font-medium">Player de áudio</p><p className="text-xs text-muted-foreground">Arquivo mockado</p></div>
            </div>
            <audio controls className="w-full" aria-label={`Player de áudio: ${material.name}`} data-mock-player>
              {material.source && <source src={material.source} type="audio/mpeg" />}
            </audio>
          </div>
        )}
        {material.type === "txt" && (
          <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap rounded-xl border bg-secondary/30 p-5 text-sm leading-7 text-foreground sm:p-7">
            {material.textContent}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}
