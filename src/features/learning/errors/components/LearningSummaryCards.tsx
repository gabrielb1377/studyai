import Link from "next/link";
import { BrainCircuit, CheckCircle2, NotebookPen, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/card";

export interface LearningSummaryData {
  criticalCount: number;
  attentionCount: number;
  pendingErrorsCount: number;
  reviewedErrorsCount: number;
  resolvedErrorsCount: number;
  recommendationsCount: number;
  masteredCount: number;
  insufficientCount: number;
}

export function LearningSummaryCards({ summary }: { summary: LearningSummaryData }) {
  return (
    <section aria-label="Resumo da aprendizagem" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Card className="gap-1.5 p-4 shadow-none">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Pontos de atenção</span>
          <BrainCircuit className="size-4 text-primary" />
        </div>
        <p className="text-2xl font-semibold tracking-tight">
          {summary.criticalCount + summary.attentionCount}
        </p>
        <p className="text-xs text-muted-foreground">
          {summary.criticalCount} crítico(s) · {summary.attentionCount} em atenção
        </p>
      </Card>

      <Card className="gap-1.5 p-4 shadow-none">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Erros pendentes</span>
          <NotebookPen className="size-4 text-destructive" />
        </div>
        <p className="text-2xl font-semibold tracking-tight">{summary.pendingErrorsCount}</p>
        <p className="text-xs text-muted-foreground">
          {summary.reviewedErrorsCount} revisado(s) · {summary.resolvedErrorsCount} resolvido(s)
        </p>
      </Card>

      <Card className="gap-1.5 p-4 shadow-none">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Revisões direcionadas</span>
          <RotateCcw className="size-4 text-amber-600 dark:text-amber-400" />
        </div>
        <p className="text-2xl font-semibold tracking-tight">{summary.recommendationsCount}</p>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Fila priorizada</span>
          <Link href="/planejamento" className="font-medium text-primary hover:underline">
            Ver planejamento
          </Link>
        </div>
      </Card>

      <Card className="gap-1.5 p-4 shadow-none">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Domínio consolidado</span>
          <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
        </div>
        <p className="text-2xl font-semibold tracking-tight">{summary.masteredCount}</p>
        <p className="text-xs text-muted-foreground">
          {summary.insufficientCount} tema(s) sem dados suficientes
        </p>
      </Card>
    </section>
  );
}
