"use client";

import { CheckCircle2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropZone } from "./DropZone";
import { ImportFileCard } from "./ImportFileCard";
import { ImportProgress } from "./ImportProgress";
import { useImport } from "./useImport";

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
  const hasPendingFiles = files.some(
    (file) => file.status === "uploaded" || file.status === "error",
  );

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
      />
    </div>
  );
}
