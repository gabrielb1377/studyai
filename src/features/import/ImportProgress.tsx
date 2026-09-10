import { CheckCircle2, LoaderCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { ImportPhase } from "@/types/import";

export function ImportProgress({
  phase,
  progress,
  fileCount,
}: {
  phase: ImportPhase;
  progress: number;
  fileCount: number;
}) {
  if (!fileCount) return null;

  return (
    <Card className="gap-4 p-5 shadow-none" aria-live="polite">
      <div className="flex items-center gap-3">
        {phase === "complete" ? (
          <CheckCircle2 className="size-5 text-primary" aria-hidden="true" />
        ) : phase === "processing" ? (
          <LoaderCircle
            className="size-5 text-primary motion-safe:animate-spin"
            aria-hidden="true"
          />
        ) : (
          <span className="size-2 rounded-full bg-muted-foreground" />
        )}
        <div>
          <h2 className="text-sm font-semibold">Progresso da importação</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {phase === "complete"
              ? "Extração local concluída. Nenhum arquivo foi enviado."
              : phase === "processing"
                ? "Extraindo texto e metadados localmente..."
                : `${fileCount} ${fileCount === 1 ? "arquivo pronto" : "arquivos prontos"} para importar.`}
          </p>
        </div>
        <span className="ml-auto text-sm font-medium tabular-nums">
          {progress}%
        </span>
      </div>
      <Progress value={progress} aria-label="Progresso geral da importação" />
    </Card>
  );
}
