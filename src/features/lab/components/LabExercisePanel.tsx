import { CheckCircle2, Lightbulb, ListChecks, Sparkles, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import MarkdownRenderer from "@/features/tutor/MarkdownRenderer";
import type { LabProject } from "../types";

export function LabExercisePanel({
  project,
  onToggleStep,
}: {
  project: LabProject;
  onToggleStep?: (stepId: string) => void;
}) {
  const feedback = project.feedback;
  const steps = project.exercise.steps ?? [];
  const completedSteps = steps.filter((step) => step.done).length;

  return (
    <aside className="space-y-4">
      <section className="rounded-2xl border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">Exercício</h2>
          <Badge variant="outline">
            {project.exercise.difficulty === "easy"
              ? "Fácil"
              : project.exercise.difficulty === "hard"
                ? "Difícil"
                : "Médio"}
          </Badge>
        </div>

        <div className="mt-3 text-sm leading-6">
          <MarkdownRenderer content={project.exercise.statement} />
        </div>

        {project.exercise.expectedResult ? (
          <div className="mt-4 rounded-xl bg-secondary/60 p-3 text-xs leading-5">
            <strong>Resultado esperado</strong>
            <p className="mt-1 text-muted-foreground">{project.exercise.expectedResult}</p>
          </div>
        ) : null}

        {steps.length ? (
          <div className="mt-4 rounded-xl border bg-background/60 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
              <ListChecks className="size-4 text-primary" />
              <span>Passos guiados</span>
              <span className="ml-auto text-muted-foreground tabular-nums">
                {completedSteps}/{steps.length}
              </span>
            </div>
            <ul className="space-y-2">
              {steps.map((step) => (
                <li key={step.id}>
                  <label className="flex cursor-pointer items-start gap-2 text-xs leading-5">
                    <input
                      type="checkbox"
                      checked={Boolean(step.done)}
                      onChange={() => onToggleStep?.(step.id)}
                      className="mt-0.5 size-4 shrink-0 accent-primary"
                    />
                    <span className={step.done ? "line-through text-muted-foreground" : "text-foreground"}>
                      {step.title}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {project.exercise.hints.length ? (
          <details className="mt-3 rounded-xl border p-3 text-sm">
            <summary className="cursor-pointer font-medium">
              <Lightbulb className="mr-2 inline size-4 text-amber-500" />
              Dicas
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              {project.exercise.hints.map((hint) => (
                <li key={hint}>{hint}</li>
              ))}
            </ul>
          </details>
        ) : null}

        {project.exercise.solution ? (
          <details className="mt-3 rounded-xl border p-3 text-sm">
            <summary className="cursor-pointer font-medium">Solução de referência</summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-3 font-mono text-xs text-slate-100">
              {project.exercise.solution}
            </pre>
          </details>
        ) : null}
      </section>

      <section className="rounded-2xl border bg-card p-4">
        <h2 className="font-semibold">Progresso prático</h2>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-secondary/50 p-2">
            <dt className="text-[11px] text-muted-foreground">Tentativas</dt>
            <dd className="mt-1 font-semibold">{project.attempts}</dd>
          </div>
          <div className="rounded-xl bg-emerald-500/10 p-2">
            <dt className="text-[11px] text-muted-foreground">Acertos</dt>
            <dd className="mt-1 font-semibold text-emerald-700 dark:text-emerald-300">{project.correctAttempts}</dd>
          </div>
          <div className="rounded-xl bg-destructive/10 p-2">
            <dt className="text-[11px] text-muted-foreground">Erros</dt>
            <dd className="mt-1 font-semibold text-destructive">{project.wrongAttempts}</dd>
          </div>
        </dl>
      </section>

      {feedback ? (
        <section className="space-y-4 rounded-2xl border border-primary/20 bg-primary/5 p-4" aria-labelledby="lab-feedback-title">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <h2 id="lab-feedback-title" className="font-semibold">Correção do Professor</h2>
            <Badge className="ml-auto">{feedback.score}%</Badge>
          </div>
          {feedback.correct.length ? (
            <div>
              <h3 className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="size-4" />O que está certo
              </h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-muted-foreground">
                {feedback.correct.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          ) : null}
          {feedback.incorrect.length ? (
            <div>
              <h3 className="flex items-center gap-2 text-sm font-medium text-destructive">
                <XCircle className="size-4" />O que melhorar
              </h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-muted-foreground">
                {feedback.incorrect.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          ) : null}
          <div className="space-y-3 text-xs leading-5">
            <p><strong>Explicação:</strong> {feedback.explanation}</p>
            <p><strong>Melhoria:</strong> {feedback.improvement}</p>
            <details>
              <summary className="cursor-pointer font-medium">Solução alternativa</summary>
              <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-950 p-3 font-mono text-slate-100">{feedback.alternativeSolution}</pre>
            </details>
          </div>
          <p className="text-[11px] text-muted-foreground">{feedback.provider} · {feedback.model}</p>
        </section>
      ) : null}
    </aside>
  );
}
