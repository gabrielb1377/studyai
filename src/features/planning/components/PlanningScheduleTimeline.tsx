import Link from "next/link";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  formatDateLabel,
  MAX_ITEM_MINUTES,
  MIN_ITEM_MINUTES,
} from "../PlanningValidation";
import type { PlanningPriority, StudyPlan, StudyPlanItem } from "../types";
import {
  KIND_BADGE_CLASSES,
  KIND_LABELS,
  PRIORITY_BADGE_CLASSES,
  PRIORITY_LABELS,
} from "./planning-constants";

export interface DayGroup {
  dayOffset: number;
  dateStr: string;
  items: StudyPlanItem[];
  totalMinutes: number;
}

export function PlanningScheduleTimeline({
  plan,
  groupedByDay,
  summary,
  isSaving,
  onGeneratePlan,
  onToggleItemCompleted,
  onUpdateItemPriority,
  onUpdateItemDuration,
  onMoveItem,
}: {
  plan: StudyPlan;
  groupedByDay: DayGroup[];
  summary: {
    completedItemsCount: number;
    plannedItemsCount: number;
    unavailableItemsCount: number;
  };
  isSaving: boolean;
  onGeneratePlan: () => Promise<void>;
  onToggleItemCompleted: (itemId: string) => Promise<void>;
  onUpdateItemPriority: (itemId: string, priority: PlanningPriority) => Promise<void>;
  onUpdateItemDuration: (itemId: string, minutes: number) => Promise<void>;
  onMoveItem: (itemId: string, direction: "up" | "down") => Promise<void>;
}) {
  return (
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
            onClick={() => void onGeneratePlan()}
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
                          onClick={() => void onToggleItemCompleted(item.id)}
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
                            void onUpdateItemPriority(item.id, event.target.value as PlanningPriority)
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
                            onClick={() => void onUpdateItemDuration(item.id, item.estimatedMinutes - 5)}
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
                            onClick={() => void onUpdateItemDuration(item.id, item.estimatedMinutes + 5)}
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
                            onClick={() => void onMoveItem(item.id, "up")}
                          >
                            <ArrowUp className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Mover ${item.title} para baixo`}
                            disabled={isSaving || isLast}
                            onClick={() => void onMoveItem(item.id, "down")}
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
  );
}
