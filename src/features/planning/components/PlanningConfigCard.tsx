import { RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Exam } from "@/types/exam";
import type { StudyRecord } from "@/types/study-engine";
import { MAX_DAILY_MINUTES, MIN_DAILY_MINUTES } from "../PlanningValidation";
import type { PlanningFocus, PlanningPriority, StudyPlan, StudyPlanConfig } from "../types";

export function PlanningConfigCard({
  configDraft,
  exams,
  studies,
  knowledgeByStudy,
  plan,
  canGenerate,
  isSaving,
  showStudyControls,
  onToggleShowStudyControls,
  onUpdateConfig,
  onToggleStudySelection,
  onSetManualStudyPriority,
  onClearPlan,
  onGeneratePlan,
}: {
  configDraft: StudyPlanConfig;
  exams: Exam[];
  studies: StudyRecord[];
  knowledgeByStudy: Map<string, { knowledge: number; confidence: number }>;
  plan: StudyPlan | null;
  canGenerate: boolean;
  isSaving: boolean;
  showStudyControls: boolean;
  onToggleShowStudyControls: () => void;
  onUpdateConfig: (patch: Partial<StudyPlanConfig>) => void;
  onToggleStudySelection: (studyId: string) => void;
  onSetManualStudyPriority: (studyId: string, priority: PlanningPriority | "auto") => void;
  onClearPlan: () => Promise<void>;
  onGeneratePlan: () => Promise<void>;
}) {
  return (
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
              onClick={() => void onClearPlan()}
              disabled={isSaving}
            >
              <Trash2 className="size-4" />
              Limpar plano
            </Button>
          ) : null}
          <Button
            type="button"
            onClick={() => void onGeneratePlan()}
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
            onChange={(event) => onUpdateConfig({ title: event.target.value })}
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
            onChange={(event) => onUpdateConfig({ goal: event.target.value })}
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
              onChange={(event) => onUpdateConfig({ dailyMinutes: Number(event.target.value) })}
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
                  onClick={() => onUpdateConfig({ dailyMinutes: preset })}
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
              onChange={(event) => onUpdateConfig({ horizonDays: Number(event.target.value) })}
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
              onChange={(event) => onUpdateConfig({ preferredFocus: event.target.value as PlanningFocus })}
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
            onChange={(event) => onUpdateConfig({ includeExams: event.target.checked })}
            className="size-4 rounded border"
          />
          <span>Integrar provas da Semana de Prova ({exams.length} cadastradas)</span>
        </label>

        {studies.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onToggleShowStudyControls}
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
                      onChange={() => onToggleStudySelection(study.studyId)}
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
                      onSetManualStudyPriority(study.studyId, event.target.value as PlanningPriority | "auto")
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
  );
}
