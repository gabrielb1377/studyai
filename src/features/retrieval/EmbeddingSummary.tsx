"use client";

import { BrainCircuit, CircleDot, LoaderCircle, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useEmbeddings } from "./useEmbeddings";

const statusLabels = {
  idle: "Não iniciado",
  indexing: "Indexando",
  ready: "Indexado",
  error: "Erro",
};

function formatDate(value?: string) {
  if (!value) return "Ainda não realizada";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function EmbeddingSummary() {
  const { store, isReady } = useEmbeddings();
  const status = isReady ? store.status : "indexing";
  const StatusIcon = status === "indexing"
    ? LoaderCircle
    : status === "ready"
      ? BrainCircuit
      : status === "error"
        ? TriangleAlert
        : CircleDot;

  return (
    <section aria-labelledby="embedding-summary-title">
      <Card className="h-full gap-4 p-5 shadow-none sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
              <StatusIcon className={status === "indexing" ? "size-5 animate-spin" : "size-5"} />
            </span>
            <div>
              <h2 id="embedding-summary-title" className="font-semibold">Índice semântico</h2>
              <p className="text-sm text-muted-foreground">Busca híbrida local</p>
            </div>
          </div>
          <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
            {statusLabels[status]}
          </span>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Embeddings gerados</dt>
            <dd className="mt-1 font-semibold">{store.embeddings.length}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Última indexação</dt>
            <dd className="mt-1 font-semibold">{formatDate(store.lastIndexedAt)}</dd>
          </div>
        </dl>
        {store.error ? <p className="text-xs text-destructive">{store.error}</p> : null}
      </Card>
    </section>
  );
}
