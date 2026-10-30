"use client";

import { useEffect, useRef, useState } from "react";
import { FileWarning, LoaderCircle } from "lucide-react";
import { MaterialBinaryStorage } from "@/services/material-binary-storage";
import { MaterialRuntimeStore } from "@/services/material-runtime-store";
import type { Material } from "@/types/material";
import { renderPdfPage } from "../pdf";

type PreviewState = "loading" | "ready" | "missing" | "error";

export function OriginalPagePreview({ material, page }: { material: Material; page: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<PreviewState>("loading");
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setState("loading");
    setImageUrl(null);

    void (async () => {
      const file = MaterialRuntimeStore.get(material.id)?.file ?? await MaterialBinaryStorage.load(material);
      if (!active) return;
      if (!file) {
        setState("missing");
        return;
      }
      if (material.fileType === "pdf") {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const width = containerRef.current?.clientWidth ?? 640;
        await renderPdfPage(file, page, { canvas, maxWidth: Math.max(320, width) });
        if (active) setState("ready");
        return;
      }
      if (["png", "jpg", "jpeg", "webp"].includes(material.fileType)) {
        objectUrl = URL.createObjectURL(file);
        setImageUrl(objectUrl);
        setState("ready");
        return;
      }
      setState("missing");
    })().catch(() => {
      if (active) setState("error");
    });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [material, page]);

  return (
    <div ref={containerRef} className="space-y-2">
      <div className="relative flex min-h-48 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={`Página original ${page} de ${material.name}`} className="h-auto w-full" />
        ) : (
          <canvas
            ref={canvasRef}
            aria-label={`Página original ${page} de ${material.name}`}
            className={`h-auto w-full ${state === "ready" ? "" : "hidden"}`}
          />
        )}
        {state === "loading" ? (
          <p className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Carregando página original…
          </p>
        ) : null}
        {state === "missing" ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            A página original não está disponível neste dispositivo. Reimporte o arquivo para comparar visualmente.
          </p>
        ) : null}
        {state === "error" ? (
          <p role="alert" className="flex items-center gap-2 px-4 py-8 text-center text-sm text-destructive">
            <FileWarning className="size-4" aria-hidden="true" />
            Não foi possível renderizar a página original.
          </p>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Prévia local, renderizada do arquivo original. Nenhum conteúdo é enviado para servidores externos.
      </p>
    </div>
  );
}
