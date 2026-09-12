"use client";

import { useState } from "react";
import { FileText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { StudySummary } from "@/types/summary";
import { useSummaries } from "./hooks/useSummaries";
import { SummaryDialog } from "./SummaryDialog";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(value));
}

export function SummaryList({ studyId }: { studyId?: string }) {
  const { summaries, isReady, saveSummary, deleteSummary } = useSummaries(studyId);
  const [selectedSummary, setSelectedSummary] = useState<StudySummary | null>(null);

  return (
    <section aria-labelledby="saved-summaries-title" className="space-y-4">
      <div>
        <h2 id="saved-summaries-title" className="text-lg font-semibold tracking-tight">Resumos salvos</h2>
        <p className="mt-1 text-sm text-muted-foreground">Resumos gerados no Tutor IA e guardados neste navegador.</p>
      </div>
      {!isReady ? (
        <Card className="p-5 text-sm text-muted-foreground shadow-none">Carregando resumos...</Card>
      ) : summaries.length === 0 ? (
        <Card className="border-dashed p-5 text-sm text-muted-foreground shadow-none">Nenhum resumo salvo ainda. Gere um resumo no Tutor IA para encontrá-lo aqui.</Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {summaries.map((summary) => (
            <Card key={summary.id} className="gap-0 p-4 shadow-none">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary"><FileText className="size-4" aria-hidden="true" /></span>
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelectedSummary(summary)}>
                  <h3 className="truncate text-sm font-semibold hover:underline">{summary.title}</h3>
                  <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">{summary.content}</p>
                  <time className="mt-3 block text-xs text-muted-foreground">Atualizado em {formatDate(summary.updatedAt)}</time>
                </button>
                <Button type="button" variant="ghost" size="icon-sm" className="shrink-0 text-muted-foreground hover:text-destructive" aria-label={`Excluir resumo ${summary.title}`} onClick={() => deleteSummary(summary.id)}>
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <SummaryDialog
        summary={selectedSummary}
        open={selectedSummary !== null}
        isSaved
        onOpenChange={(open) => !open && setSelectedSummary(null)}
        onSave={(summary) => {
          saveSummary(summary);
          setSelectedSummary(summary);
        }}
        onDelete={(summaryId) => {
          deleteSummary(summaryId);
          setSelectedSummary(null);
        }}
      />
    </section>
  );
}
