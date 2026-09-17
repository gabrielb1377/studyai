"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Activity, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useExtraction } from "@/features/extraction/useExtraction";
import { useEmbeddings } from "@/features/retrieval/useEmbeddings";
import { useFlashcards } from "@/features/flashcards/useFlashcards";
import { useQuiz } from "@/features/quiz/useQuiz";
import { useSummaries } from "@/features/summaries/hooks/useSummaries";
import { useMaterials } from "@/hooks/useMaterials";
import { StorageManager } from "@/lib/storage/StorageManager";
import type { AIManagerStatus } from "@/features/ai/AIProvider";

const IngestionPipelineStatus = dynamic(
  () => import("@/features/extraction/IngestionPipelineStatus").then((module) => module.IngestionPipelineStatus),
  { loading: () => <p className="rounded-xl border p-5 text-sm text-muted-foreground">Carregando detalhes da ingestão…</p> },
);

function formatDuration(milliseconds: number) {
  if (milliseconds < 1_000) return `${milliseconds} ms`;
  return `${(milliseconds / 1_000).toFixed(1)} s`;
}

export function DiagnosticsDrawer() {
  const [open, setOpen] = useState(false);
  const [chunkCount, setChunkCount] = useState(0);
  const [aiStatus, setAIStatus] = useState<AIManagerStatus | null>(null);
  const { materials } = useMaterials();
  const { statistics } = useExtraction();
  const { store } = useEmbeddings();
  const { cards } = useFlashcards();
  const { results } = useQuiz();
  const { summaries } = useSummaries();

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      const [chunks, response] = await Promise.all([
        StorageManager.getAll("chunks"),
        fetch("/api/ai/manager", { cache: "no-store" }).catch(() => null),
      ]);
      setChunkCount(chunks.length);
      setAIStatus(response?.ok ? await response.json() as AIManagerStatus : null);
    };
    void load();
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  const stats = [
    ["Uso IA", aiStatus?.statistics.messages ?? 0],
    ["Tokens", aiStatus?.statistics.tokens?.toLocaleString("pt-BR") ?? "—"],
    ["Tempo médio", `${aiStatus?.statistics.averageResponseTimeMs ?? 0} ms`],
    ["PDFs", materials.filter((material) => material.fileType === "pdf").length],
    ["Extraídos", statistics.extracted],
    ["Erros", statistics.errors],
    ["OCR", statistics.ocr],
    ["Transcrições", statistics.transcriptions],
    ["Embeddings", store.embeddings.length],
    ["Chunks", chunkCount],
    ["Resumos", summaries.length],
    ["Flashcards", cards.length],
    ["Quiz", results.length],
  ] as const;

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Activity />Detalhes da ingestão
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/35" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <aside role="dialog" aria-modal="true" aria-labelledby="diagnostics-title" className="ml-auto flex h-full w-full max-w-2xl flex-col border-l bg-background shadow-2xl">
            <header className="flex items-start justify-between gap-4 border-b p-5 sm:p-6">
              <div><h2 id="diagnostics-title" className="text-lg font-semibold">Detalhes da ingestão</h2><p className="mt-1 text-sm text-muted-foreground">Pipeline, desempenho e uso interno do StudyAI.</p></div>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Fechar detalhes da ingestão" onClick={() => setOpen(false)}><X /></Button>
            </header>
            <div className="flex-1 space-y-6 overflow-y-auto p-5 sm:p-6">
              <section aria-label="Estatísticas de diagnóstico" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {stats.map(([label, value]) => (
                  <Card
                    key={label}
                    aria-label={`${label}: ${value}`}
                    className="gap-1 p-4 shadow-none"
                  >
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-lg font-semibold">{value}</p>
                  </Card>
                ))}
              </section>
              <Card className="gap-2 p-4 shadow-none"><p className="text-xs text-muted-foreground">Tempo total de processamento</p><p className="font-semibold">{formatDuration(statistics.processingTimeMs)}</p></Card>
              <IngestionPipelineStatus />
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
