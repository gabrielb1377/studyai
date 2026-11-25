"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { RouteLoading } from "@/components/route-states";
import { useStudyPlan } from "../hooks/useStudyPlan";
import { WeeklyGoalPanel } from "./WeeklyGoalPanel";
import { PlanningSummaryMetrics } from "./PlanningSummaryMetrics";
import { PlanningConfigCard } from "./PlanningConfigCard";
import { PlanningEmptyState } from "./PlanningEmptyState";
import { PlanningScheduleTimeline, type DayGroup } from "./PlanningScheduleTimeline";

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
    const groups = new Map<number, DayGroup>();
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
      <RouteLoading label="Carregando planejamento de estudos">
        <div className="space-y-4" aria-busy="true">
          <div className="grid gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-24 animate-pulse rounded-xl border bg-muted/30" />
            ))}
          </div>
          <div className="h-64 animate-pulse rounded-xl border bg-muted/30" />
        </div>
      </RouteLoading>
    );
  }

  return (
    <div className="space-y-6">
      <PlanningSummaryMetrics summary={summary} />

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

      <WeeklyGoalPanel />

      <PlanningConfigCard
        configDraft={configDraft}
        exams={exams}
        studies={studies}
        knowledgeByStudy={knowledgeByStudy}
        plan={plan}
        canGenerate={canGenerate}
        isSaving={isSaving}
        showStudyControls={showStudyControls}
        onToggleShowStudyControls={() => setShowStudyControls((open) => !open)}
        onUpdateConfig={updateConfig}
        onToggleStudySelection={toggleStudySelection}
        onSetManualStudyPriority={setManualStudyPriority}
        onClearPlan={clearPlan}
        onGeneratePlan={generatePlan}
      />

      {!plan ? (
        <PlanningEmptyState
          canGenerate={canGenerate}
          summary={summary}
          isSaving={isSaving}
          onGeneratePlan={generatePlan}
        />
      ) : (
        <PlanningScheduleTimeline
          plan={plan}
          groupedByDay={groupedByDay}
          summary={summary}
          isSaving={isSaving}
          onGeneratePlan={generatePlan}
          onToggleItemCompleted={toggleItemCompleted}
          onUpdateItemPriority={updateItemPriority}
          onUpdateItemDuration={updateItemDuration}
          onMoveItem={moveItem}
        />
      )}
    </div>
  );
}
