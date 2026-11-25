import Link from "next/link";
import { BookOpen, Calendar, Clock3, Target } from "lucide-react";
import { Card } from "@/components/ui/card";

export interface PlanningSummaryData {
  totalStudies: number;
  upcomingExamsCount: number;
  dueReviewsCount: number;
  dueFlashcardsCount: number;
  pendingErrorsCount: number;
  completedItemsCount: number;
  plannedItemsCount: number;
  totalMinutes: number;
}

export function PlanningSummaryMetrics({ summary }: { summary: PlanningSummaryData }) {
  return (
    <section aria-label="Resumo do planejamento" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Card className="gap-1.5 p-4 shadow-none">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Estudos disponíveis</span>
          <BookOpen className="size-4 text-primary" />
        </div>
        <p className="text-2xl font-semibold tracking-tight">{summary.totalStudies}</p>
        <p className="text-xs text-muted-foreground">
          {summary.totalStudies === 0 ? "Nenhum tema importado ainda" : "Base real de materiais e progresso"}
        </p>
      </Card>

      <Card className="gap-1.5 p-4 shadow-none">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Provas próximas</span>
          <Calendar className="size-4 text-primary" />
        </div>
        <p className="text-2xl font-semibold tracking-tight">{summary.upcomingExamsCount}</p>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Semana de Prova</span>
          <Link href="/provas" className="font-medium text-primary hover:underline">
            Gerenciar
          </Link>
        </div>
      </Card>

      <Card className="gap-1.5 p-4 shadow-none">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Revisões pendentes</span>
          <Clock3 className="size-4 text-amber-600 dark:text-amber-400" />
        </div>
        <p className="text-2xl font-semibold tracking-tight">
          {summary.dueReviewsCount + summary.dueFlashcardsCount + summary.pendingErrorsCount}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {summary.dueReviewsCount} tópicos · {summary.dueFlashcardsCount} flashcards · {summary.pendingErrorsCount} erros
          </span>
          <Link href="/aprendizagem" className="font-medium text-primary hover:underline">
            Caderno de Erros
          </Link>
        </div>
      </Card>

      <Card className="gap-1.5 p-4 shadow-none">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Atividades no plano</span>
          <Target className="size-4 text-emerald-600 dark:text-emerald-400" />
        </div>
        <p className="text-2xl font-semibold tracking-tight">
          {summary.completedItemsCount}/{summary.plannedItemsCount}
        </p>
        <p className="text-xs text-muted-foreground">
          {summary.totalMinutes > 0 ? `${summary.totalMinutes} min distribuídos` : "Nenhum plano gerado"}
        </p>
      </Card>
    </section>
  );
}
