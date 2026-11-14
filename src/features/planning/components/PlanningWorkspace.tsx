"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Calendar,
  Check,
  Clock3,
  ExternalLink,
  RefreshCw,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDateLabel, MIN_DAILY_MINUTES, MAX_DAILY_MINUTES, MIN_ITEM_MINUTES, MAX_ITEM_MINUTES } from "../PlanningValidation";
import { useStudyPlan } from "../hooks/useStudyPlan";
import type { PlanningActivityKind, PlanningFocus, PlanningPriority, StudyPlanItem } from "../types";

const KIND_LABELS: Record<PlanningActivityKind, string> = {
  exam_prep: "Semana de Prova",
  review: "Revisão",
  flashcards: "Flashcards",
  practice_quiz: "Prática / Quiz",
  lab: "Laboratório",
  tutor: "Tutor IA",
  study_reading: "Leitura guiada",
};

const PRIORITY_LABELS: Record<PlanningPriority, string> = {
  high: "Alta",
  medium: "Média",
  low: "Baixa",
};

const PRIORITY_BADGE_CLASSES: Record<PlanningPriority, string> = {
  high: "border-destructive/30 bg-destructive/10 text-destructive",
  medium: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  low: "border-border bg-muted/60 text-muted-foreground",
};

const KIND_BADGE_CLASSES: Record<PlanningActivityKind, string> = {
  exam_prep: "border-primary/30 bg-primary/10 text-primary",
  review: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  flashcards: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  practice_quiz: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  lab: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  tutor: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  study_reading: "border-border bg-muted/60 text-foreground",
};

export function PlanningWorkspace({ requestedExamId }: { requestedExamId?: string }) {
  const {
    plan,
    studies,
    exams,
    knowledge,
    configDraft,
    summary,
    isLoading,
    isSaving,
    error,
    statusMessage,
    updateConfig,
    toggleStudySelection,
    setManualStudyPriority,
    generatePlan,
    toggleItemCompleted,
    updateItemPriority,
    updateItemDuration,
    moveItem,
    clearPlan,
  } = useStudyPlan(requestedExamId);

  const [showStudyControls, setShowStudyControls] = useState(false);

  const knowledgeByStudy = useMemo(
    () => new Map(knowledge.map((entry) => [entry.studyId, entry])),
    [knowledge],
  );

  const groupedByDay = useMemo(() => {
    if (!plan) return [];
    const groups = new Map<number, { dayOffset: number; dateStr: string; items: StudyPlanItem[]; totalMinutes: number }>();
    for (const item of plan.items) {
      const existing = groups.get(item.dayOffset);
      if (existing) {
        existing.items.push(item);
        existing.totalMinutes += item.estimatedMinutes;
      } else {
        groups.set(item.dayOffset, {
          dayOffset: item.dayOffset,
          dateStr: item.dateStr,
          items: [item],
          totalMinutes: item.estimatedMinutes,
        });
      }
    }
    return [...groups.values()].sort((left, right) => left.dayOffset - right.dayOffset);
  }, [plan]);

  const canGenerate = studies.length > 0 || (configDraft.includeExams && summary.upcomingExamsCount > 0);

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="grid gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-xl border bg-muted/30" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-xl border bg-muted/30" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Métricas consolidadas reais */}
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
            {summary.dueReviewsCount + summary.dueFlashcardsCount}
          </p>
          <p className="text-xs text-muted-foreground">
            {summary.dueReviewsCount} tópicos · {summary.dueFlashcardsCount} flashcards
          </p>
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

      {error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <AlertTriangle className="size-4 shrink-0" />
          <span className="flex-1">{error}</span>
        </div>
      ) : null}

      {statusMessage ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-2.5 text-sm text-foreground"
        >
          <span className="flex items-center gap-2">
            <Check className="size-4 text-primary" />
            {statusMessage}
          </span>
          {plan ? (
            <span className="text-xs text-muted-foreground">
              Atualizado às {new Date(plan.updatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Painel de Configuração de Metas e Prioridades */}
      <Card className="gap-4 p-5 shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Metas e disponibilidade</h2>
            <p className="text-xs text-muted-foreground">
              Ajuste seu tempo diário, horizonte e prioridades antes de gerar ou recalcular o cronograma.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {plan ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void clearPlan()}
                disabled={isSaving}
              >
                <Trash2 className="size-4" />
                Limpar plano
              </Button>
            ) : null}
            <Button
              type="button"
              onClick={() => void generatePlan()}
              disabled={!canGenerate || isSaving}
            >
              {plan ? <RefreshCw className="size-4" /> : <Sparkles className="size-4" />}
              {plan ? "Recalcular prioridades" : "Gerar plano inteligente"}
            </Button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <label htmlFor="plan-title-input" className="text-xs font-medium text-foreground">
              Nome do plano
            </label>
            <Input
              id="plan-title-input"
              value={configDraft.title}
              maxLength={100}
              onChange={(event) => updateConfig({ title: event.target.value })}
              placeholder="Ex.: Reta final P1"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
            <label htmlFor="plan-goal-input" className="text-xs font-medium text-foreground">
              Meta principal
            </label>
            <Input
              id="plan-goal-input"
              value={configDraft.goal}
              maxLength={240}
              onChange={(event) => updateConfig({ goal: event.target.value })}
              placeholder="Ex.: Dominar pontos difíceis e revisar provas"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="plan-minutes-input" className="text-xs font-medium text-foreground">
              Tempo diário (min)
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="plan-minutes-input"
                type="number"
                min={MIN_DAILY_MINUTES}
                max={MAX_DAILY_MINUTES}
                step={5}
                value={configDraft.dailyMinutes}
                onChange={(event) => updateConfig({ dailyMinutes: Number(event.target.value) })}
                className="w-24"
              />
              <div className="flex flex-wrap gap-1">
                {[30, 60, 90, 120].map((preset) => (
                  <Button
                    key={preset}
                    type="button"
                    size="sm"
                    variant={configDraft.dailyMinutes === preset ? "default" : "outline"}
                    className="h-8 px-2 text-xs"
                    onClick={() => updateConfig({ dailyMinutes: preset })}
                  >
                    {preset}m
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <label htmlFor="plan-horizon-select" className="text-xs font-medium text-foreground">
                Horizonte
              </label>
              <select
                id="plan-horizon-select"
                value={configDraft.horizonDays}
                onChange={(event) => updateConfig({ horizonDays: Number(event.target.value) })}
                className="h-9 w-full rounded-md border bg-background px-2.5 text-sm"
              >
                {[3, 5, 7, 14, 30].map((days) => (
                  <option key={days} value={days}>
                    {days} dias
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="plan-focus-select" className="text-xs font-medium text-foreground">
                Foco
              </label>
              <select
                id="plan-focus-select"
                value={configDraft.preferredFocus}
                onChange={(event) => updateConfig({ preferredFocus: event.target.value as PlanningFocus })}
                className="h-9 w-full rounded-md border bg-background px-2.5 text-sm"
              >
                <option value="balanced">Equilibrado</option>
                <option value="exams">Provas próximas</option>
                <option value="reviews">Revisões pendentes</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={configDraft.includeExams}
              onChange={(event) => updateConfig({ includeExams: event.target.checked })}
              className="size-4 rounded border"
            />
            <span>Integrar provas da Semana de Prova ({exams.length} cadastradas)</span>
          </label>

          {studies.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowStudyControls((open) => !open)}
              aria-expanded={showStudyControls}
            >
              {showStudyControls
                ? "Ocultar seleção de estudos"
                : `Personalizar estudos e prioridades (${configDraft.selectedStudyIds.length || "todos"})`}
            </Button>
          ) : null}
        </div>

        {showStudyControls && studies.length > 0 ? (
          <div className="space-y-2 rounded-xl border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">
              Deixe todos desmarcados para incluir automaticamente todo o histórico ou selecione temas específicos e defina prioridades manuais.
            </p>
            <div className="grid gap-2 md:grid-cols-2">
              {studies.map((study) => {
                const selected = configDraft.selectedStudyIds.includes(study.studyId);
                const knowledgeEntry = knowledgeByStudy.get(study.studyId);
                const manualPriority = configDraft.manualStudyPriorities[study.studyId] ?? "auto";
                return (
                  <div
                    key={study.studyId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2"
                  >
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleStudySelection(study.studyId)}
                        className="size-4 shrink-0 rounded border"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{study.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {study.subject} · {Math.round(study.progress)}% progresso
                          {knowledgeEntry ? ` · ${Math.round(knowledgeEntry.knowledge)}% domínio` : ""}
                        </p>
                      </div>
                    </label>
                    <select
                      aria-label={`Prioridade manual de ${study.title}`}
                      value={manualPriority}
                      onChange={(event) =>
                        setManualStudyPriority(study.studyId, event.target.value as PlanningPriority | "auto")
                      }
                      className="h-8 rounded-md border bg-background px-2 text-xs"
                    >
                      <option value="auto">Automática</option>
                      <option value="high">Alta</option>
                      <option value="medium">Média</option>
                      <option value="low">Baixa</option>
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </Card>

      {/* Estados vazios e Lista Cronológica */}
      {!plan && !canGenerate ? (
        <Card className="items-center gap-3 p-8 text-center shadow-none">
          <Sparkles className="size-8 text-primary" />
          <div className="space-y-1">
            <h2 className="text-base font-semibold">Adicione seus primeiros conteúdos para começar</h2>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              O planejamento usa seus estudos reais, revisões pendentes e provas cadastradas. Importe um material ou crie uma prova na Semana de Prova.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            <Button asChild>
              <Link href="/importar">Importar material</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/provas">Abrir Semana de Prova</Link>
            </Button>
          </div>
        </Card>
      ) : !plan ? (
        <Card className="items-center gap-3 border-dashed p-8 text-center shadow-none">
          <Target className="size-8 text-primary" />
          <div className="space-y-1">
            <h2 className="text-base font-semibold">Seus sinais reais estão prontos para virar plano</h2>
            <p className="mx-auto max-w-lg text-sm text-muted-foreground">
              Encontramos {summary.totalStudies} estudo(s), {summary.upcomingExamsCount} prova(s) próxima(s) e{" "}
              {summary.dueReviewsCount + summary.dueFlashcardsCount} revisão(ões) pendente(s). Gere seu plano com um clique.
            </p>
          </div>
          <Button type="button" onClick={() => void generatePlan()} disabled={isSaving}>
            <Sparkles className="size-4" />
            Criar plano agora
          </Button>
        </Card>
      ) : (
        <section aria-label="Cronograma diário de estudos" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">{plan.title}</h2>
              {plan.goal ? <p className="text-sm text-muted-foreground">Meta: {plan.goal}</p> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{plan.dailyMinutes} min/dia</Badge>
              <Badge variant="outline">
                {summary.completedItemsCount} de {summary.plannedItemsCount} concluídas
              </Badge>
            </div>
          </div>

          {summary.unavailableItemsCount > 0 ? (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm"
            >
              <span className="flex items-center gap-2">
                <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                {summary.unavailableItemsCount} atividade(s) apontam para um estudo ou prova que não está mais disponível nesta conta.
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void generatePlan()}
                disabled={isSaving}
              >
                Recalcular plano
              </Button>
            </div>
          ) : null}

          {groupedByDay.length === 0 ? (
            <Card className="p-6 text-center text-sm text-muted-foreground shadow-none">
              Nenhuma atividade pendente com os filtros atuais. Ajuste a seleção de estudos ou habilite a Semana de Prova e clique em Recalcular.
            </Card>
          ) : (
            <div className="space-y-4">
              {groupedByDay.map((group) => (
                <Card key={group.dayOffset} className="gap-3 p-4 shadow-none">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">
                        {group.dayOffset === 0
                          ? `Hoje · ${formatDateLabel(group.dateStr)}`
                          : group.dayOffset === 1
                            ? `Amanhã · ${formatDateLabel(group.dateStr)}`
                            : `Dia ${group.dayOffset + 1} · ${formatDateLabel(group.dateStr)}`}
                      </span>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        group.totalMinutes > plan.dailyMinutes
                          ? "border-amber-500/40 text-amber-700 dark:text-amber-300"
                          : undefined
                      }
                    >
                      {group.totalMinutes} / {plan.dailyMinutes} min
                    </Badge>
                  </div>

                  <div className="space-y-2.5">
                    {group.items.map((item) => {
                      const itemIndex = plan.items.findIndex((entry) => entry.id === item.id);
                      const isFirst = itemIndex <= 0;
                      const isLast = itemIndex === -1 || itemIndex >= plan.items.length - 1;

                      return (
                        <article
                          key={item.id}
                          className={`flex flex-col gap-3 rounded-xl border p-3.5 transition-colors sm:flex-row sm:items-center ${
                            item.completed ? "bg-muted/35 opacity-85" : "bg-background"
                          }`}
                        >
                          <div className="flex min-w-0 flex-1 items-start gap-3">
                            <button
                              type="button"
                              aria-pressed={item.completed}
                              aria-label={
                                item.completed
                                  ? `Desmarcar "${item.title}" como concluída`
                                  : `Marcar "${item.title}" como concluída`
                              }
                              onClick={() => void toggleItemCompleted(item.id)}
                              disabled={isSaving}
                              className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs transition-colors ${
                                item.completed
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-muted-foreground/40 hover:border-primary"
                              }`}
                            >
                              {item.completed ? <Check className="size-3.5" /> : null}
                            </button>

                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <Badge variant="outline" className={KIND_BADGE_CLASSES[item.kind]}>
                                  {KIND_LABELS[item.kind]}
                                </Badge>
                                <Badge variant="outline" className={PRIORITY_BADGE_CLASSES[item.priority]}>
                                  {PRIORITY_LABELS[item.priority]}
                                </Badge>
                                <Badge variant="secondary">{item.subject}</Badge>
                                {item.sourceUnavailable ? (
                                  <Badge variant="destructive">Estudo indisponível</Badge>
                                ) : null}
                              </div>

                              <p className={`text-sm font-medium ${item.completed ? "line-through text-muted-foreground" : ""}`}>
                                {item.title}
                              </p>
                              <p className="text-xs text-muted-foreground">{item.reason}</p>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                            <select
                              aria-label={`Prioridade de ${item.title}`}
                              value={item.priority}
                              disabled={isSaving}
                              onChange={(event) =>
                                void updateItemPriority(item.id, event.target.value as PlanningPriority)
                              }
                              className="h-8 rounded-md border bg-background px-2 text-xs"
                            >
                              <option value="high">Alta</option>
                              <option value="medium">Média</option>
                              <option value="low">Baixa</option>
                            </select>

                            <div className="flex items-center rounded-md border bg-background">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 text-xs"
                                aria-label={`Diminuir duração de ${item.title}`}
                                disabled={isSaving || item.estimatedMinutes <= MIN_ITEM_MINUTES}
                                onClick={() => void updateItemDuration(item.id, item.estimatedMinutes - 5)}
                              >
                                -5
                              </Button>
                              <span
                                className="min-w-[3.25rem] text-center text-xs font-medium"
                                aria-label={`Duração de ${item.title}`}
                              >
                                {item.estimatedMinutes} min
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 text-xs"
                                aria-label={`Aumentar duração de ${item.title}`}
                                disabled={isSaving || item.estimatedMinutes >= MAX_ITEM_MINUTES}
                                onClick={() => void updateItemDuration(item.id, item.estimatedMinutes + 5)}
                              >
                                +5
                              </Button>
                            </div>

                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Mover ${item.title} para cima`}
                                disabled={isSaving || isFirst}
                                onClick={() => void moveItem(item.id, "up")}
                              >
                                <ArrowUp className="size-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Mover ${item.title} para baixo`}
                                disabled={isSaving || isLast}
                                onClick={() => void moveItem(item.id, "down")}
                              >
                                <ArrowDown className="size-4" />
                              </Button>
                            </div>

                            {item.sourceUnavailable ? (
                              <Button type="button" variant="outline" size="sm" disabled>
                                Indisponível
                              </Button>
                            ) : (
                              <Button asChild variant="outline" size="sm">
                                <Link href={item.targetHref}>
                                  Abrir
                                  <ExternalLink className="size-3.5" />
                                </Link>
                              </Button>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
