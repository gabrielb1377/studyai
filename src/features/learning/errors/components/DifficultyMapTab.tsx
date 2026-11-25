import Link from "next/link";
import { BookOpen, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import type { DifficultyMapItem } from "../DifficultyMapEngine";
import type { ReliableAssessmentIndicator } from "@/features/learning/adaptive/types";
import { LEVEL_BADGE_CLASSES, LEVEL_LABELS, REVIEW_STATUS_LABELS } from "./learning-constants";

export function DifficultyMapTab({
  difficultyItems,
  assessmentIndicator,
  onSelectStudyFilter,
  onGoToErrorsTab,
}: {
  difficultyItems: DifficultyMapItem[];
  assessmentIndicator: ReliableAssessmentIndicator;
  onSelectStudyFilter: (studyId: string) => void;
  onGoToErrorsTab: () => void;
}) {
  return (
    <section aria-label="Mapa de dificuldades" className="space-y-4">
      {difficultyItems.length > 0 ? (
        <Card className="gap-2 p-4 shadow-none">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">Indicadores confiáveis de avaliação</h2>
              <p className="text-xs text-muted-foreground">{assessmentIndicator.disclaimer}</p>
            </div>
            <Badge variant="outline">
              {assessmentIndicator.reliabilityLabel} · {assessmentIndicator.sampleSize} questão(ões)
            </Badge>
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span>
              Acurácia média:{" "}
              <strong className="text-foreground">
                {assessmentIndicator.accuracyPercent !== null
                  ? `${assessmentIndicator.accuracyPercent}%`
                  : "Sem questões avaliadas"}
              </strong>
            </span>
            <span>
              Sessões avaliadas: <strong className="text-foreground">{assessmentIndicator.sessionsCount}</strong>
            </span>
            <span>
              Revisões vencidas: <strong className="text-foreground">{assessmentIndicator.dueFlashcardsCount}</strong>
            </span>
          </div>
        </Card>
      ) : null}

      {difficultyItems.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Nenhum tema avaliado ainda"
          description="Importe materiais na Biblioteca ou pratique no Quiz, Flashcards e Semana de Prova para construir seu mapa real de dificuldades."
        >
          <div className="mt-4">
            <Button asChild size="sm">
              <Link href="/biblioteca">Ir para Biblioteca</Link>
            </Button>
          </div>
        </EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {difficultyItems.map((item) => (
            <Card key={item.study.studyId} className="gap-3 p-4 shadow-none">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <h2 className="truncate text-base font-semibold">{item.study.title}</h2>
                  <p className="text-xs text-muted-foreground">
                    {item.study.subject} · {REVIEW_STATUS_LABELS[item.reviewStatus]}
                  </p>
                </div>
                <Badge variant="outline" className={LEVEL_BADGE_CLASSES[item.level]}>
                  {LEVEL_LABELS[item.level]}
                </Badge>
              </div>

              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>Domínio: {item.knowledge.knowledge}%</span>
                <span>·</span>
                <span>Confiança: {item.knowledge.confidence}%</span>
                <span>·</span>
                <span>{item.pendingErrorsCount} erro(s) pendente(s)</span>
                {item.dueFlashcardsCount > 0 ? (
                  <>
                    <span>·</span>
                    <span>{item.dueFlashcardsCount} flashcard(s) pendente(s)</span>
                  </>
                ) : null}
              </div>

              <p className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                Evolução: {item.evolution.label}
              </p>

              <ul className="space-y-1 text-xs text-muted-foreground">
                {item.reasons.slice(0, 3).map((reason) => (
                  <li key={reason}>• {reason}</li>
                ))}
              </ul>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/estudo?tema=${encodeURIComponent(item.study.studyId)}&origem=aprendizagem`}>
                    Abrir estudo
                    <ExternalLink className="size-3.5" />
                  </Link>
                </Button>
                {item.pendingErrorsCount > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      onSelectStudyFilter(item.study.studyId);
                      onGoToErrorsTab();
                    }}
                  >
                    Ver erros ({item.pendingErrorsCount})
                  </Button>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
