"use client";

import Link from "next/link";
import { useState } from "react";
import { BookOpen, ChevronDown, ChevronUp, ExternalLink, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import type {
  AdaptiveActivityGoal,
  AdaptiveSkillRecommendation,
  AuthorizedSignalKind,
} from "@/features/ai/skills";
import type { DifficultyMapItem } from "../DifficultyMapEngine";
import type { ReliableAssessmentIndicator } from "@/features/learning/adaptive/types";
import { LEVEL_BADGE_CLASSES, LEVEL_LABELS, REVIEW_STATUS_LABELS } from "./learning-constants";

const SIGNAL_KIND_LABELS: Record<AuthorizedSignalKind, string> = {
  observed: "Observado",
  estimated: "Estimativa",
  explicit_preference: "Preferência",
};

const GOAL_OPTIONS: ReadonlyArray<{ value: AdaptiveActivityGoal; label: string }> = [
  { value: "learn", label: "Aprender ou consolidar tema" },
  { value: "review", label: "Revisão do conteúdo" },
  { value: "exam_prep", label: "Preparação para prova" },
  { value: "practice", label: "Prática com exercícios" },
  { value: "error_review", label: "Revisão de erros" },
];

export function DifficultyMapTab({
  difficultyItems,
  assessmentIndicator,
  adaptiveGoal = "learn",
  onChangeAdaptiveGoal,
  adaptiveRecommendationsByStudyId,
  adaptivePersonalizationEnabled = true,
  isSaving = false,
  onToggleAdaptivePersonalization,
  onSelectStudyFilter,
  onGoToErrorsTab,
}: {
  difficultyItems: DifficultyMapItem[];
  assessmentIndicator: ReliableAssessmentIndicator;
  adaptiveGoal?: AdaptiveActivityGoal;
  onChangeAdaptiveGoal?: (goal: AdaptiveActivityGoal) => void;
  adaptiveRecommendationsByStudyId?: Record<string, AdaptiveSkillRecommendation>;
  adaptivePersonalizationEnabled?: boolean;
  isSaving?: boolean;
  onToggleAdaptivePersonalization?: (enabled: boolean) => Promise<void>;
  onSelectStudyFilter: (studyId: string) => void;
  onGoToErrorsTab: () => void;
}) {
  const [expandedExplanationIds, setExpandedExplanationIds] = useState<Record<string, boolean>>({});

  const toggleExplanation = (studyId: string) => {
    setExpandedExplanationIds((current) => ({
      ...current,
      [studyId]: !current[studyId],
    }));
  };

  return (
    <section aria-label="Mapa de dificuldades" className="space-y-4">
      {difficultyItems.length > 0 ? (
        <Card className="min-w-0 gap-2 p-4 shadow-none">
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

      {difficultyItems.length > 0 && adaptiveRecommendationsByStudyId ? (
        <Card className="min-w-0 gap-3 p-4 shadow-none" aria-label="Controles de personalização adaptativa">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Sparkles className="size-4 text-primary" aria-hidden="true" />
                <h2 className="text-sm font-semibold">Recomendação adaptativa de estudo</h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Sugere skill, nível e método de forma determinística e explicável (sem chamadas extras de IA nem execução automática).
              </p>
            </div>
            {onToggleAdaptivePersonalization ? (
              <Button
                type="button"
                role="switch"
                aria-checked={adaptivePersonalizationEnabled}
                variant={adaptivePersonalizationEnabled ? "default" : "outline"}
                size="sm"
                disabled={isSaving}
                onClick={() => void onToggleAdaptivePersonalization(!adaptivePersonalizationEnabled)}
              >
                {adaptivePersonalizationEnabled
                  ? "Personalização ativa"
                  : "Personalização desativada"}
              </Button>
            ) : null}
          </div>

          {onChangeAdaptiveGoal ? (
            <div className="flex flex-wrap items-center gap-3 border-t pt-3">
              <label className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
                <span>Objetivo atual</span>
                <select
                  aria-label="Objetivo da recomendação adaptativa"
                  value={adaptiveGoal}
                  onChange={(event) =>
                    onChangeAdaptiveGoal(event.target.value as AdaptiveActivityGoal)
                  }
                  className="h-8 max-w-full rounded-md border bg-background px-2.5 text-xs font-normal text-foreground"
                >
                  {GOAL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <span className="text-xs text-muted-foreground">
                {adaptivePersonalizationEnabled
                  ? "Você pode inspecionar os sinais usados ou desativar a personalização a qualquer momento."
                  : "Modo manual preservado: nenhuma recomendação automática sobrescreve sua escolha."}
              </span>
            </div>
          ) : null}
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
          {difficultyItems.map((item) => {
            const recommendation = adaptiveRecommendationsByStudyId?.[item.study.studyId];
            const isExpanded = Boolean(expandedExplanationIds[item.study.studyId]);
            const explanationPanelId = `al1-explanation-${item.study.studyId}`;
            return (
              <Card key={item.study.studyId} className="min-w-0 gap-3 p-4 shadow-none">
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

                {recommendation ? (
                  <div
                    className="space-y-2 rounded-lg border bg-background/80 p-3 text-xs"
                    data-al1-mode={recommendation.mode}
                    data-al1-skill={recommendation.skillId}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <span className="font-medium text-foreground">
                          Abordagem sugerida:
                        </span>
                        <Badge variant="secondary" className="font-mono text-[11px]">
                          {recommendation.skillId}@{recommendation.skillVersion}
                        </Badge>
                        {recommendation.mode === "manual_disabled" ? (
                          <Badge variant="outline" className="text-[11px]">
                            Modo manual
                          </Badge>
                        ) : recommendation.insufficientEvidence ? (
                          <Badge variant="outline" className="text-[11px]">
                            Fallback seguro
                          </Badge>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs motion-reduce:transition-none"
                        aria-expanded={isExpanded}
                        aria-controls={explanationPanelId}
                        onClick={() => toggleExplanation(item.study.studyId)}
                      >
                        {isExpanded ? (
                          <>
                            Ocultar motivo
                            <ChevronUp className="ml-1 size-3.5" aria-hidden="true" />
                          </>
                        ) : (
                          <>
                            Por que esta escolha?
                            <ChevronDown className="ml-1 size-3.5" aria-hidden="true" />
                          </>
                        )}
                      </Button>
                    </div>

                    <p className="text-muted-foreground">
                      Nível: <strong className="text-foreground">{recommendation.suggestedLevelLabel}</strong>
                      {" · "}
                      Método: <strong className="text-foreground">{recommendation.suggestedMethodLabel}</strong>
                    </p>

                    {isExpanded ? (
                      <div
                        id={explanationPanelId}
                        className="space-y-2 border-t pt-2 text-muted-foreground"
                      >
                        <div>
                          <p className="font-medium text-foreground">Razões da recomendação</p>
                          <ul className="mt-1 space-y-1">
                            {recommendation.reasons.map((reason) => (
                              <li key={reason}>• {reason}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">Sinais autorizados utilizados</p>
                          <ul className="mt-1 space-y-1">
                            {recommendation.authorizedSignalsUsed.map((signal) => (
                              <li key={`${signal.category}-${signal.label}`}>
                                • [{SIGNAL_KIND_LABELS[signal.kind]}] {signal.label}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <p className="text-[11px] leading-4">
                          {recommendation.manualAlternative.description}
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : null}

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
            );
          })}
        </div>
      )}
    </section>
  );
}
