import { Check, Circle, Clock3 } from "lucide-react";
import type { MentorPlanStep } from "../types";

export function MentorPlan({ steps }: { steps: readonly MentorPlanStep[] }) {
  return (
    <ol className="space-y-2" aria-label="Plano da sessão">
      {steps.map((step) => <li key={step.id} className={`flex gap-3 rounded-lg border p-3 ${step.status === "active" ? "border-primary/50 bg-primary/5" : "bg-background/50"}`}>
        <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border ${step.status === "completed" ? "border-emerald-500 bg-emerald-500 text-white" : step.status === "active" ? "border-primary text-primary" : "text-muted-foreground"}`}>
          {step.status === "completed" ? <Check className="size-3" /> : <Circle className="size-2.5" />}
        </span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{step.title}</span><span className="block text-xs text-muted-foreground">{step.description}</span></span>
        <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground"><Clock3 className="size-3" />{step.estimatedMinutes} min</span>
      </li>)}
    </ol>
  );
}

