"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, Edit3, Target, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ExperiencePreferencesService } from "@/features/preferences/ExperiencePreferences";
import {
  MAX_WEEKLY_MINUTES,
  MAX_WEEKLY_SESSIONS,
  MIN_WEEKLY_MINUTES,
  MIN_WEEKLY_SESSIONS,
  clampWeeklyGoalTarget,
  type WeeklyGoalType,
} from "../WeeklyGoals";
import { useWeeklyGoals } from "../hooks/useWeeklyGoals";

function formatSessionDuration(focusSeconds: number): string {
  const minutes = Math.floor(focusSeconds / 60);
  const seconds = focusSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  if (seconds === 0) return `${minutes} min`;
  return `${minutes} min ${seconds}s`;
}

function formatTarget(type: WeeklyGoalType, value: number): string {
  if (type === "sessions") {
    return `${value} ${value === 1 ? "sessão" : "sessões"}`;
  }
  return `${value} min`;
}

export function WeeklyGoalPanel({
  compact = false,
  showPlanningLink = false,
}: {
  compact?: boolean;
  showPlanningLink?: boolean;
}) {
  const { goal, progress, isLoading, isSaving, error, saveGoal, clearGoal } = useWeeklyGoals();
  const [editing, setEditing] = useState(false);
  const [goalType, setGoalType] = useState<WeeklyGoalType>("minutes");
  const [targetInput, setTargetInput] = useState<string>("180");
  const [showSessions, setShowSessions] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mediaReduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReducedMotion(ExperiencePreferencesService.get().reducedMotion || mediaReduced);
  }, []);

  useEffect(() => {
    if (goal) {
      setGoalType(goal.type);
      setTargetInput(String(goal.target));
    }
  }, [goal]);

  const openEditor = () => {
    if (goal) {
      setGoalType(goal.type);
      setTargetInput(String(goal.target));
    } else {
      setGoalType("minutes");
      setTargetInput("180");
    }
    setFeedback(null);
    setEditing(true);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    const clamped = clampWeeklyGoalTarget(goalType, Number(targetInput));
    const saved = await saveGoal({ type: goalType, target: clamped });
    if (saved) {
      setEditing(false);
      setFeedback("Meta semanal salva.");
    }
  };

  const handleClear = async () => {
    await clearGoal();
    setEditing(false);
    setFeedback("Meta semanal removida.");
  };

  if (isLoading) {
    return (
      <Card className="p-4 shadow-none">
        <p role="status" className="text-xs text-muted-foreground">
          Carregando meta semanal…
        </p>
      </Card>
    );
  }

  return (
    <section aria-labelledby="weekly-goal-heading">
      <Card className={`gap-4 shadow-none ${compact ? "p-4 sm:p-5" : "p-5"}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Target className="size-4 text-primary" aria-hidden="true" />
              <h2 id="weekly-goal-heading" className="text-base font-semibold">
                Meta semanal de estudo
              </h2>
              <Badge variant="outline" className="gap-1 text-xs font-normal">
                <CalendarDays className="size-3" aria-hidden="true" />
                {progress.week.periodLabel}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Contagem automática de domingo a sábado (horário local), apenas para sessões concluídas sem tempo pausado.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {showPlanningLink ? (
              <Button asChild size="sm" variant="outline">
                <Link href="/planejamento">Planejamento</Link>
              </Button>
            ) : null}
            {!editing ? (
              <Button
                type="button"
                size="sm"
                variant={goal ? "outline" : "default"}
                onClick={openEditor}
                disabled={isSaving}
              >
                <Edit3 className="size-3.5" />
                {goal ? "Alterar meta" : "Definir meta semanal"}
              </Button>
            ) : null}
            {goal && !editing ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label="Remover meta semanal"
                onClick={() => void handleClear()}
                disabled={isSaving}
              >
                <Trash2 className="size-3.5" />
                Remover
              </Button>
            ) : null}
          </div>
        </div>

        {error ? (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        ) : null}

        {feedback ? (
          <p role="status" aria-live="polite" className="text-xs font-medium text-primary">
            {feedback}
          </p>
        ) : null}

        {editing ? (
          <form onSubmit={(event) => void handleSave(event)} className="grid gap-3 rounded-xl border bg-muted/20 p-3.5 sm:grid-cols-[auto_1fr_auto] sm:items-end">
            <div className="space-y-1">
              <label htmlFor="weekly-goal-type" className="text-xs font-medium">
                Tipo de meta
              </label>
              <select
                id="weekly-goal-type"
                value={goalType}
                onChange={(event) => {
                  const nextType = event.target.value as WeeklyGoalType;
                  setGoalType(nextType);
                  setTargetInput(nextType === "sessions" ? "5" : "180");
                }}
                className="h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="minutes">Tempo (minutos)</option>
                <option value="sessions">Sessões concluídas</option>
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="weekly-goal-target" className="text-xs font-medium">
                {goalType === "sessions" ? "Quantidade de sessões na semana" : "Minutos na semana"}
              </label>
              <Input
                id="weekly-goal-target"
                type="number"
                min={goalType === "sessions" ? MIN_WEEKLY_SESSIONS : MIN_WEEKLY_MINUTES}
                max={goalType === "sessions" ? MAX_WEEKLY_SESSIONS : MAX_WEEKLY_MINUTES}
                step={goalType === "sessions" ? 1 : 15}
                value={targetInput}
                onChange={(event) => setTargetInput(event.target.value)}
                className="h-9"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" size="sm" disabled={isSaving}>
                Salvar meta
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={isSaving}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : null}

        {goal ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border bg-background/60 p-3">
                <p className="text-xs text-muted-foreground">Meta definida</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {formatTarget(goal.type, goal.target)}
                </p>
              </div>
              <div className="rounded-xl border bg-background/60 p-3">
                <p className="text-xs text-muted-foreground">Progresso atual</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {formatTarget(goal.type, progress.currentValue)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {progress.completedMinutes} min · {progress.completedSessions}{" "}
                  {progress.completedSessions === 1 ? "sessão" : "sessões"}
                </p>
              </div>
              <div className="rounded-xl border bg-background/60 p-3">
                <p className="text-xs text-muted-foreground">Restante</p>
                <p className="mt-1 flex items-center gap-1.5 text-lg font-semibold tabular-nums">
                  {progress.achieved ? (
                    <>
                      <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                      <span>Meta atingida</span>
                    </>
                  ) : (
                    formatTarget(goal.type, progress.remainingValue)
                  )}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Evolução semanal</span>
                <span className="font-medium text-foreground tabular-nums">{progress.percent}%</span>
              </div>
              <div
                role="progressbar"
                aria-label="Progresso da meta semanal"
                aria-valuemin={0}
                aria-valuemax={goal.target}
                aria-valuenow={progress.currentValue}
                className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
              >
                <div
                  className={`h-full rounded-full bg-primary ${reducedMotion ? "" : "transition-[width] duration-300"}`}
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed p-3.5 text-xs">
            <div className="space-y-1">
              <p className="font-medium text-foreground">Nenhuma meta semanal configurada</p>
              <p className="text-muted-foreground">
                Defina uma meta de minutos ou sessões para acompanhar sua consistência nesta semana ({progress.completedMinutes} min ·{" "}
                {progress.completedSessions} {progress.completedSessions === 1 ? "sessão concluída" : "sessões concluídas"}).
              </p>
            </div>
          </div>
        )}

        <div className="border-t pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock3 className="size-3.5" aria-hidden="true" />
              <span>
                Sessões contabilizadas na semana:{" "}
                <strong className="font-medium text-foreground">{progress.completedSessions}</strong> (
                {progress.completedMinutes} min efetivos)
              </span>
            </p>
            {progress.countedSessions.length > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                aria-expanded={showSessions}
                onClick={() => setShowSessions((current) => !current)}
              >
                {showSessions ? "Ocultar sessões" : "Ver sessões"}
              </Button>
            ) : null}
          </div>

          {showSessions && progress.countedSessions.length > 0 ? (
            <ul className="mt-3 space-y-2" aria-label="Sessões contabilizadas nesta semana">
              {progress.countedSessions.slice(0, 8).map((session) => (
                <li
                  key={session.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      {session.studyTitle ?? "Sessão de estudo"}
                      {session.subject ? ` · ${session.subject}` : ""}
                    </p>
                    <p className="text-muted-foreground">
                      {session.origin === "focus" ? "Modo Foco" : "Workspace"}
                      {session.goalLabel ? ` · ${session.goalLabel}` : ""} ·{" "}
                      {new Date(session.endedAt ?? session.updatedAt).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <Badge variant="secondary" className="tabular-nums">
                    {formatSessionDuration(session.focusSeconds)}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Card>
    </section>
  );
}
