import Link from "next/link";
import { Sparkles, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import type { PlanningSummaryData } from "./PlanningSummaryMetrics";

export function PlanningEmptyState({
  canGenerate,
  summary,
  isSaving,
  onGeneratePlan,
}: {
  canGenerate: boolean;
  summary: PlanningSummaryData;
  isSaving: boolean;
  onGeneratePlan: () => Promise<void>;
}) {
  if (!canGenerate) {
    return (
      <EmptyState
        icon={Sparkles}
        title="Adicione seus primeiros conteúdos para começar"
        description="O planejamento usa seus estudos reais, revisões pendentes e provas cadastradas. Importe um material ou crie uma prova na Semana de Prova."
      >
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button asChild size="sm">
            <Link href="/importar">Importar material</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/provas">Abrir Semana de Prova</Link>
          </Button>
        </div>
      </EmptyState>
    );
  }

  return (
    <EmptyState
      icon={Target}
      title="Seus sinais reais estão prontos para virar plano"
      description={`Encontramos ${summary.totalStudies} estudo(s), ${summary.upcomingExamsCount} prova(s) próxima(s) e ${
        summary.dueReviewsCount + summary.dueFlashcardsCount
      } revisão(ões) pendente(s). Gere seu plano com um clique.`}
    >
      <div className="mt-4">
        <Button
          type="button"
          size="sm"
          onClick={() => void onGeneratePlan()}
          disabled={isSaving}
        >
          <Sparkles className="size-4" />
          Criar plano agora
        </Button>
      </div>
    </EmptyState>
  );
}
