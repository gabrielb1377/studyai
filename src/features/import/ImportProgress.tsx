import { CheckCircle2, LoaderCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { ImportPhase } from "@/types/import";
import type { IngestionStageId } from "@/features/extraction/ExtractionTypes";

const visibleStages: Array<{ id: IngestionStageId; label: string }> = [
  { id: "document", label: "Importando" },
  { id: "extraction", label: "Extração" },
  { id: "ocr", label: "OCR" },
  { id: "study", label: "Learning" },
  { id: "semantic", label: "Knowledge Graph" },
  { id: "indexed", label: "Finalizando" },
];

export function ImportProgress({
  phase,
  progress,
  fileCount,
  errorCount,
  currentStage,
}: {
  phase: ImportPhase;
  progress: number;
  fileCount: number;
  errorCount: number;
  currentStage?: IngestionStageId;
}) {
  if (!fileCount) return null;

  return (
    <Card className="gap-4 p-5 shadow-none" aria-live="polite">
      <div className="flex items-center gap-3">
        {phase === "complete" ? (
          errorCount > 0
            ? <span className="flex size-5 items-center justify-center rounded-full bg-destructive/10 text-xs font-semibold text-destructive">!</span>
            : <CheckCircle2 className="size-5 text-primary" aria-hidden="true" />
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
              ? errorCount > 0
                ? `Processamento concluído com ${errorCount} ${errorCount === 1 ? "arquivo em erro" : "arquivos em erro"}. Nenhum arquivo foi enviado.`
                : "Extração local concluída. Nenhum arquivo foi enviado."
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
      {phase !== "idle" && <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">{visibleStages.map((stage) => {
        const index = visibleStages.findIndex((item) => item.id === currentStage);
        const stageIndex = visibleStages.indexOf(stage);
        const complete = phase === "complete" || (index >= 0 && stageIndex < index);
        const active = phase === "processing" && stage.id === currentStage;
        return <li key={stage.id} className={`rounded-lg border px-3 py-2 text-center text-[11px] font-medium ${active ? "border-primary bg-primary/5 text-primary" : complete ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>{complete ? "✓ " : active ? "• " : ""}{stage.label}</li>;
      })}</ol>}
    </Card>
  );
}
