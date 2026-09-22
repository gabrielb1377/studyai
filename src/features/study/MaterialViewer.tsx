"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { AudioLines, ChevronLeft, ChevronRight, FileText, Headphones, ImageIcon, RefreshCw, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatFileSize } from "@/features/import/import-utils";
import type { StudyMaterial } from "@/types/study";
import { MaterialBinaryStorage } from "@/services/material-binary-storage";
import { MaterialRuntimeStore } from "@/services/material-runtime-store";
import { MaterialService } from "@/services/material-service";
import { CloudFileService } from "@/features/sync/CloudFileService";

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
  studyId,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
  compact = false,
}: {
  material: StudyMaterial;
  studyId: string;
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
  compact?: boolean;
}) {
  const Icon = materialIcons[material.type];
  const [source, setSource] = useState(material.source);
  const [isRestoring, setIsRestoring] = useState(false);
  const [pdfView, setPdfView] = useState<"text" | "pdf">("pdf");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    const runtimeSource = MaterialRuntimeStore.get(material.id)?.source ?? material.source;
    setSource(runtimeSource);
    setPdfView("pdf");
    if (runtimeSource) return () => { active = false; };
    setIsRestoring(true);
    void MaterialBinaryStorage.load(material).then(async (localFile) => {
      const file = localFile ?? await CloudFileService.download(material).catch(() => null);
      if (!active || !file) return;
      MaterialRuntimeStore.register(material.id, file);
      setSource(MaterialRuntimeStore.get(material.id)?.source);
    }).finally(() => {
      if (active) setIsRestoring(false);
    });
    return () => { active = false; };
  }, [material]);

  const selectAgain = async (file: File | undefined) => {
    if (!file) return;
    MaterialRuntimeStore.register(material.id, file);
    const persistentBinary = await MaterialBinaryStorage.save(material.id, file);
    await MaterialService.update(material.id, { persistentBinary });
    setSource(MaterialRuntimeStore.get(material.id)?.source);
    setPdfView("pdf");
  };

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
        <input ref={fileInputRef} type="file" className="sr-only" accept={material.type === "pdf" ? ".pdf,application/pdf" : undefined} onChange={(event) => { void selectAgain(event.target.files?.[0]); event.currentTarget.value = ""; }} />
        {material.type === "pdf" && (
          <div className="space-y-4">
            <div className="inline-flex rounded-lg border bg-muted p-1" role="tablist" aria-label="Visualização do material">
              <Button type="button" size="sm" variant={pdfView === "text" ? "secondary" : "ghost"} role="tab" aria-selected={pdfView === "text"} onClick={() => setPdfView("text")}>Texto</Button>
              <Button type="button" size="sm" variant={pdfView === "pdf" ? "secondary" : "ghost"} role="tab" aria-selected={pdfView === "pdf"} onClick={() => setPdfView("pdf")}>PDF</Button>
            </div>
            {pdfView === "text" && <pre className="max-h-[620px] overflow-auto whitespace-pre-wrap rounded-xl border bg-secondary/30 p-5 text-sm leading-7 text-foreground sm:p-7">{material.textContent || "Nenhum texto foi extraído deste PDF."}</pre>}
            {pdfView === "pdf" && source && <PdfMaterialViewer key={material.id} material={{ ...material, source }} studyId={studyId} compact={compact} />}
            {pdfView === "pdf" && !source && (
              <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                <p>{isRestoring ? "Procurando o PDF neste dispositivo e na nuvem…" : "O PDF original não está disponível neste dispositivo."}</p>
                {!isRestoring && <Button type="button" variant="outline" className="mt-4" onClick={() => fileInputRef.current?.click()}><RefreshCw />Selecionar novamente</Button>}
                <p className="mt-3 text-xs">Página, zoom, capítulo e marcadores permanecem salvos.</p>
              </div>
            )}
          </div>
        )}
        {material.type === "video" && (
          <div className="overflow-hidden rounded-xl border bg-black/90">
            <video controls className="aspect-video w-full" aria-label={`Player de vídeo: ${material.name}`}>
              {source && <source src={source} type="video/mp4" />}
            </video>
            {!source && <p className="px-4 py-3 text-center text-xs text-white/60">Selecione novamente o arquivo para reproduzi-lo.</p>}
          </div>
        )}
        {material.type === "audio" && (
          <div className="rounded-xl border bg-secondary/40 p-5 sm:p-8">
            <div className="mb-5 flex items-center gap-3">
              <span className="flex size-12 items-center justify-center rounded-xl bg-card text-primary shadow-sm"><AudioLines className="size-6" aria-hidden="true" /></span>
              <div><p className="text-sm font-medium">Player de áudio</p><p className="text-xs text-muted-foreground">{source ? "Arquivo importado" : "Selecione novamente para reproduzir"}</p></div>
            </div>
            <audio controls className="w-full" aria-label={`Player de áudio: ${material.name}`}>
              {source && <source src={source} type={material.mimeType} />}
            </audio>
          </div>
        )}
        {(material.type === "text" || material.type === "document") && (
          <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap rounded-xl border bg-secondary/30 p-5 text-sm leading-7 text-foreground sm:p-7">
            {material.textContent || "Nenhum texto foi extraído deste material."}
          </pre>
        )}
        {material.type === "image" && source && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={source} alt={material.name} className="mx-auto max-h-[620px] rounded-xl object-contain" />
        )}
        {material.type === "image" && !source && (
          <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Reimporte a imagem para visualizá-la nesta sessão.</p>
        )}
      </CardContent>
    </Card>
  );
}
