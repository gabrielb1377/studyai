"use client";

import { useEffect, useRef } from "react";
import { CheckCircle2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropZone } from "./DropZone";
import { ImportFileCard } from "./ImportFileCard";
import { ImportProgress } from "./ImportProgress";
import { useImport } from "./useImport";
import { MOBILE_FILES_EVENT, MobileBridge } from "@/features/platform/MobileBridge";
import { PWAService } from "@/features/platform/PWAService";

export function ImportWorkspace() {
  const {
    files,
    phase,
    feedback,
    overallProgress,
    addFiles,
    removeFile,
    importFiles,
  } = useImport();
  const processing = phase === "processing";
  const addFilesRef = useRef(addFiles);
  addFilesRef.current = addFiles;
  const hasPendingFiles = files.some(
    (file) => file.status === "uploaded" || file.status === "error",
  );

  useEffect(() => {
    void PWAService.consumeSharedFiles().then(async (shared) => { if (shared.length) await addFilesRef.current(shared); });
    const receiveNativeFiles = (event: Event) => {
      const urls = (event as CustomEvent<{ urls: string[] }>).detail.urls;
      void Promise.all(urls.map(async (url) => {
        const blob = await MobileBridge.readSharedFile(url);
        const name = decodeURIComponent(url.split("/").pop() || "material");
        return new File([blob], name, { lastModified: Date.now() });
      })).then((items) => addFilesRef.current(items));
    };
    window.addEventListener(MOBILE_FILES_EVENT, receiveNativeFiles);
    const stopDesktop = window.studyaiDesktop?.onOpenFiles((paths) => {
      void Promise.all(paths.map(async (path) => {
        const item = await window.studyaiDesktop!.readFile(path);
        return new File([new Uint8Array(item.data).buffer], item.name, { lastModified: item.lastModified });
      })).then((items) => addFilesRef.current(items));
    });
    return () => { window.removeEventListener(MOBILE_FILES_EVENT, receiveNativeFiles); stopDesktop?.(); };
  }, []);

  return (
    <div className="space-y-6">
      <DropZone disabled={processing} onFiles={addFiles} />

      {feedback && (
        <p
          role="alert"
          className="rounded-lg border bg-secondary/50 px-4 py-3 text-sm text-muted-foreground"
        >
          {feedback}.
        </p>
      )}

      {files.length > 0 && (
        <section aria-labelledby="selected-files-title" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2
                id="selected-files-title"
                className="text-lg font-semibold tracking-tight"
              >
                Arquivos selecionados
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {files.length} {files.length === 1 ? "material" : "materiais"}{" "}
                nesta extração
              </p>
            </div>
            <Button
              type="button"
              className="h-11"
              disabled={processing || !hasPendingFiles}
              onClick={() => { void importFiles(); }}
            >
              {phase === "complete" ? (
                <CheckCircle2 className="size-4" aria-hidden="true" />
              ) : (
                <Upload className="size-4" aria-hidden="true" />
              )}
              {processing
                ? "Processando..."
                : phase === "complete" && !hasPendingFiles
                  ? "Extração concluída"
                  : "Importar"}
            </Button>
          </div>

          <div
            role="list"
            aria-label="Arquivos selecionados"
            className="grid gap-3 xl:grid-cols-2"
          >
            {files.map((item) => (
              <ImportFileCard
                key={item.id}
                item={item}
                disabled={processing}
                onRemove={() => removeFile(item.id)}
              />
            ))}
          </div>
        </section>
      )}

      <ImportProgress
        phase={phase}
        progress={overallProgress}
        fileCount={files.length}
        errorCount={files.filter((file) => file.status === "error").length}
      />
    </div>
  );
}
