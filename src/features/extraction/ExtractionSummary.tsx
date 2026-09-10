"use client";

import { CircleDot, FileCheck2, LoaderCircle, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useExtraction } from "./useExtraction";

export function ExtractionSummary() {
  const { statistics, isReady } = useExtraction();
  const status = !isReady || statistics.processing > 0
    ? "Processando"
    : statistics.total === 0
      ? "Não iniciado"
      : statistics.errors > 0
        ? "Erro"
        : "Extraído";
  const StatusIcon = status === "Processando"
    ? LoaderCircle
    : status === "Extraído"
      ? FileCheck2
      : status === "Erro"
        ? TriangleAlert
        : CircleDot;

  return (
    <section aria-labelledby="extraction-summary-title">
      <Card className="gap-4 p-5 shadow-none sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-secondary text-primary">
              <StatusIcon
                className={`size-5 ${status === "Processando" ? "motion-safe:animate-spin" : ""}`}
                aria-hidden="true"
              />
            </span>
            <div>
              <h2 id="extraction-summary-title" className="text-sm font-semibold">
                Conteúdo extraído
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Status: {status}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <span><strong className="text-foreground">{statistics.extracted}</strong> extraídos</span>
            <span><strong className="text-foreground">{statistics.processing}</strong> processando</span>
            <span><strong className="text-foreground">{statistics.errors}</strong> com erro</span>
          </div>
        </div>
      </Card>
    </section>
  );
}
