"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AudioLines, ChevronLeft, ChevronRight, Download, FileText, Headphones, ImageIcon, RefreshCw, ScanText, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMediaDuration, getExtension, isMediaExtension, validateMediaSignature } from "@/features/extraction/media-validation";
import { formatFileSize } from "@/features/import/import-utils";
import { checkMaterialOfflineAvailability, type MaterialOfflineStatus } from "@/features/library/MaterialAvailability";
import { ConnectivityService } from "@/features/platform/ConnectivityService";
import { useConnectivity } from "@/features/platform/useConnectivity";
import type { StudyMaterial } from "@/types/study";
import { MaterialBinaryStorage } from "@/services/material-binary-storage";
import { MaterialRuntimeStore } from "@/services/material-runtime-store";
import { MaterialService } from "@/services/material-service";
import { CloudFileService } from "@/features/sync/CloudFileService";
import { MediaTranscriptPanel } from "./MediaTranscriptPanel";

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

function availabilityBadgeLabel(status: MaterialOfflineStatus, isOnline: boolean): string {
  switch (status) {
    case "local-complete":
      return "Disponível neste dispositivo";
    case "text-only":
      return isOnline ? "Somente texto local" : "Somente texto offline";
    case "storage-unavailable":
      return "OPFS indisponível";
    case "remote-only":
      return isOnline ? "Somente na nuvem" : "Indisponível offline";
  }
}

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
  const router = useRouter();
  const connectivity = useConnectivity();
  const [source, setSource] = useState(material.source);
  const [availability, setAvailability] = useState<MaterialOfflineStatus>(() => (
    material.source || MaterialRuntimeStore.get(material.id)
      ? "local-complete"
      : material.textContent?.trim()
        ? "text-only"
        : "remote-only"
  ));
  const [isRestoring, setIsRestoring] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [pdfView, setPdfView] = useState<"text" | "pdf">("pdf");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    const runtimeSource = MaterialRuntimeStore.get(material.id)?.source ?? material.source;
    setSource(runtimeSource);
    setPlaybackError(null);
    setPdfView("pdf");
    if (runtimeSource) {
      setAvailability("local-complete");
      return () => { active = false; };
    }
    setIsRestoring(true);
    void checkMaterialOfflineAvailability(material).then(async (result) => {
      if (!active) return;
      if (result.file) {
        MaterialRuntimeStore.register(material.id, result.file);
        setSource(MaterialRuntimeStore.get(material.id)?.source);
        setAvailability("local-complete");
        return;
      }
      setAvailability(result.status);
      if (!ConnectivityService.getSnapshot().isOnline) return;
      const remoteFile = await CloudFileService.download(material).catch(() => null);
      if (!active || !remoteFile) return;
      MaterialRuntimeStore.register(material.id, remoteFile);
      setSource(MaterialRuntimeStore.get(material.id)?.source);
      setAvailability("local-complete");
    }).finally(() => {
      if (active) setIsRestoring(false);
    });
    return () => { active = false; };
  }, [connectivity.isOnline, material]);

  const selectAgain = async (file: File | undefined) => {
    if (!file) return;
    setPlaybackError(null);
    try {
      const ext = getExtension(file.name);
      if ((material.type === "audio" || material.type === "video") && isMediaExtension(ext)) {
        await validateMediaSignature(file, ext);
      }
      MaterialRuntimeStore.register(material.id, file);
      const persistentBinary = await MaterialBinaryStorage.save(material.binaryStorageId ?? material.id, file);
      await MaterialService.update(material.id, { persistentBinary });
      setSource(MaterialRuntimeStore.get(material.id)?.source);
      setAvailability("local-complete");
      setPdfView("pdf");
    } catch (error) {
      setPlaybackError(error instanceof Error ? error.message : "Não foi possível validar o arquivo selecionado.");
    }
  };

  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const downloadFile = async () => {
    setIsDownloading(true);
    setDownloadError(null);
    try {
      const result = await checkMaterialOfflineAvailability(material);
      let file = result.file;
      if (!file && ConnectivityService.getSnapshot().isOnline) {
        file = await CloudFileService.download(material).catch(() => null);
      }
      if (!file) {
        setDownloadError(
          ConnectivityService.getSnapshot().isOnline
            ? "O arquivo original não está disponível neste dispositivo nem na nuvem."
            : "Sem conexão com a internet. O arquivo original não foi salvo localmente neste dispositivo.",
        );
        return;
      }
      const url = URL.createObjectURL(file);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = material.name;
      anchor.rel = "noopener";
      anchor.click();
      globalThis.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch {
      setDownloadError("Não foi possível baixar o arquivo.");
    } finally {
      setIsDownloading(false);
    }
  };

  const durationLabel = formatMediaDuration(material.duration);
  const acceptAttribute =
    material.type === "pdf" ? ".pdf,application/pdf" :
    material.type === "video" ? ".mp4,video/mp4" :
    material.type === "audio" ? ".mp3,.wav,.m4a,audio/*" :
    undefined;

  const missingBinaryMessage =
    availability === "storage-unavailable"
      ? "O armazenamento de arquivos grandes (OPFS) não está disponível neste navegador."
      : !connectivity.isOnline
        ? "Sem conexão com a internet e o arquivo original não está salvo neste dispositivo."
        : "O arquivo original não está disponível neste dispositivo.";

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
                <Badge variant={availability === "local-complete" ? "secondary" : "outline"} className="font-normal">
                  {availabilityBadgeLabel(availability, connectivity.isOnline)}
                </Badge>
                <span className="text-xs text-muted-foreground">{formatFileSize(material.size)}</span>
                {durationLabel && <span className="text-xs text-muted-foreground">· {durationLabel}</span>}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => router.push(`/estudo?tema=${encodeURIComponent(studyId)}&arquivo=${encodeURIComponent(material.id)}&aba=revisao`)}>
              <ScanText aria-hidden="true" />
              Revisar extração
            </Button>
            {material.type === "document" ? (
              <Button type="button" variant="outline" size="sm" onClick={() => void downloadFile()} disabled={isDownloading}>
                {isDownloading ? <RefreshCw className="size-3.5 animate-spin" aria-hidden="true" /> : <Download className="size-3.5" aria-hidden="true" />}
                Baixar original
              </Button>
            ) : null}
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
        <input ref={fileInputRef} type="file" className="sr-only" accept={acceptAttribute} onChange={(event) => { void selectAgain(event.target.files?.[0]); event.currentTarget.value = ""; }} />
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
                <p>{isRestoring ? "Procurando o PDF neste dispositivo…" : missingBinaryMessage}</p>
                {!isRestoring && (
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}><RefreshCw />Selecionar novamente</Button>
                    {material.textContent?.trim() ? (
                      <Button type="button" variant="secondary" onClick={() => setPdfView("text")}>Ler texto extraído</Button>
                    ) : null}
                  </div>
                )}
                <p className="mt-3 text-xs">Página, zoom, capítulo e marcadores permanecem salvos neste dispositivo.</p>
              </div>
            )}
          </div>
        )}
        {material.type === "video" && (
          <div>
            {playbackError && (
              <p role="alert" className="mb-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                {playbackError}
              </p>
            )}
            <div className="overflow-hidden rounded-xl border bg-black/90">
              {source ? (
                <video
                  key={source}
                  src={source}
                  controls
                  playsInline
                  preload="metadata"
                  className="aspect-video w-full"
                  aria-label={`Player de vídeo: ${material.name}`}
                  onError={() => setPlaybackError("Não foi possível reproduzir este vídeo neste navegador.")}
                />
              ) : (
                <div className="p-8 text-center text-sm text-white/75">
                  <p>{isRestoring ? "Recuperando o vídeo neste dispositivo..." : missingBinaryMessage}</p>
                  {!isRestoring && (
                    <Button type="button" variant="secondary" size="sm" className="mt-4" onClick={() => fileInputRef.current?.click()}>
                      <RefreshCw className="size-3.5" aria-hidden="true" />
                      Selecionar novamente
                    </Button>
                  )}
                </div>
              )}
            </div>
            <MediaTranscriptPanel material={material} studyId={studyId} />
          </div>
        )}
        {material.type === "audio" && (
          <div>
            {playbackError && (
              <p role="alert" className="mb-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                {playbackError}
              </p>
            )}
            <div className="rounded-xl border bg-secondary/40 p-5 sm:p-8">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex size-12 items-center justify-center rounded-xl bg-card text-primary shadow-sm"><AudioLines className="size-6" aria-hidden="true" /></span>
                  <div>
                    <p className="text-sm font-medium">Player de áudio{durationLabel ? ` · ${durationLabel}` : ""}</p>
                    <p className="text-xs text-muted-foreground">
                      {source ? "Arquivo pronto para reprodução" : isRestoring ? "Recuperando o áudio..." : missingBinaryMessage}
                    </p>
                  </div>
                </div>
                {!source && !isRestoring && (
                  <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                    <RefreshCw className="size-3.5" aria-hidden="true" />
                    Selecionar novamente
                  </Button>
                )}
              </div>
              {source && (
                <audio
                  key={source}
                  src={source}
                  controls
                  preload="metadata"
                  className="w-full"
                  aria-label={`Player de áudio: ${material.name}`}
                  onError={() => setPlaybackError("Não foi possível reproduzir este áudio neste navegador.")}
                />
              )}
            </div>
            <MediaTranscriptPanel material={material} studyId={studyId} />
          </div>
        )}
        {(material.type === "text" || material.type === "document") && (
          <div className="space-y-3">
            {downloadError ? (
              <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">{downloadError}</p>
            ) : null}
            {material.fileType === "pptx" ? (
              <p className="rounded-xl border border-dashed bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
                A pré-visualização nativa de arquivos do PowerPoint ainda não está disponível. O texto extraído do arquivo
                aparece abaixo e o original pode ser baixado ou aberto no PowerPoint.
              </p>
            ) : null}
            <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap rounded-xl border bg-secondary/30 p-5 text-sm leading-7 text-foreground sm:p-7">
              {material.textContent || "Nenhum texto foi extraído deste material."}
            </pre>
          </div>
        )}
        {material.type === "image" && source && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={source} alt={material.name} className="mx-auto max-h-[620px] rounded-xl object-contain" />
        )}
        {material.type === "image" && !source && (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            <p>{isRestoring ? "Recuperando a imagem neste dispositivo..." : missingBinaryMessage}</p>
            {!isRestoring && (
              <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => fileInputRef.current?.click()}>
                <RefreshCw className="size-3.5" aria-hidden="true" />
                Selecionar novamente
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
