"use client";

import { Check, Circle, LoaderCircle, Minus, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { IngestionStage, IngestionStageStatus } from "./ExtractionTypes";
import { useExtraction } from "./useExtraction";

const stageLabels = {
  document: "Documento",
  extraction: "Extração",
  ocr: "OCR",
  normalization: "Normalização",
  analysis: "Análise",
  study: "Study",
  chunks: "Chunks",
  embeddings: "Embeddings",
  indexed: "Indexado",
};

const statusDetails: Record<IngestionStageStatus, { label: string; className: string; icon: typeof Check }> = {
  pending: { label: "Pendente", className: "text-muted-foreground", icon: Circle },
  processing: { label: "Processando", className: "text-primary", icon: LoaderCircle },
  completed: { label: "Concluído", className: "text-emerald-600 dark:text-emerald-400", icon: Check },
  skipped: { label: "Ignorado", className: "text-muted-foreground", icon: Minus },
  error: { label: "Erro", className: "text-destructive", icon: TriangleAlert },
};

function StageItem({ stage }: { stage: IngestionStage }) {
  const details = statusDetails[stage.status];
  const Icon = details.icon;
  return (
    <li className="flex min-w-24 flex-1 items-center gap-2 rounded-lg border bg-background px-3 py-2" title={stage.message}>
      <Icon
        className={`size-3.5 shrink-0 ${details.className} ${stage.status === "processing" ? "motion-safe:animate-spin" : ""}`}
        aria-hidden="true"
      />
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium">{stageLabels[stage.id]}</span>
        <span className={`block text-[10px] ${details.className}`}>{details.label}</span>
      </span>
    </li>
  );
}

export function IngestionPipelineStatus() {
  const { records } = useExtraction();
  const latest = [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4);
  if (latest.length === 0) return null;

  return (
    <section aria-labelledby="ingestion-pipeline-title">
      <Card className="gap-5 p-5 shadow-none sm:p-6">
        <div>
          <h2 id="ingestion-pipeline-title" className="font-semibold">Pipeline de ingestão</h2>
          <p className="mt-1 text-sm text-muted-foreground">Acompanhamento dos documentos processados mais recentemente.</p>
        </div>
        <div className="space-y-5">
          {latest.map((record) => (
            <article key={record.id} className="space-y-3 border-t pt-4 first:border-0 first:pt-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="break-all text-sm font-medium">{record.metadata.name}</h3>
                <span className="text-xs text-muted-foreground">
                  {record.metadata.topic ?? record.metadata.title ?? "Análise pendente"}
                </span>
              </div>
              <ol className="flex gap-2 overflow-x-auto pb-1">
                {(record.stages ?? []).map((stage) => <StageItem key={stage.id} stage={stage} />)}
              </ol>
              {(record.logs?.length ?? 0) > 0 && (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer font-medium text-foreground">
                    Ver log do documento ({record.logs?.length})
                  </summary>
                  <ol className="mt-2 space-y-1 border-l pl-3">
                    {record.logs?.map((log) => (
                      <li key={log.id}>
                        <span className={statusDetails[log.status].className}>
                          {log.status === "completed" ? "✓" : log.status === "error" ? "✕" : log.status === "skipped" ? "−" : "•"}
                        </span>{" "}
                        {log.message}
                      </li>
                    ))}
                  </ol>
                </details>
              )}
              {record.errorDetails && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                  <p className="font-medium">{record.errorDetails.reason}</p>
                  <p className="mt-1 opacity-80">Etapa: {stageLabels[record.errorDetails.stage]}</p>
                  <p className="mt-1 opacity-80">Ação sugerida: {record.errorDetails.suggestedAction}</p>
                  {record.errorDetails.simplifiedStack && (
                    <details className="mt-2">
                      <summary className="cursor-pointer font-medium">Detalhes técnicos</summary>
                      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-[10px] opacity-75">{record.errorDetails.simplifiedStack}</pre>
                    </details>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      </Card>
    </section>
  );
}
