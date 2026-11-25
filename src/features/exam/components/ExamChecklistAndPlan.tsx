"use client";

import { Calendar, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { Exam, ExamPlanItem } from "@/types/exam";

export function ExamChecklistAndPlan({
  exam,
  plan,
  daysLeft,
  onToggleSubject,
  onMoveSubject,
}: {
  exam: Exam;
  plan: readonly ExamPlanItem[];
  daysLeft: number;
  onToggleSubject: (examId: string, subjectId: string) => void;
  onMoveSubject: (index: number, offset: number) => void;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-6 space-y-4 shadow-none">
        <h3 className="font-semibold text-base flex items-center gap-2">
          <CheckCircle2 className="size-5 text-primary" /> Checklist de Assuntos
        </h3>
        <div className="space-y-2">
          {exam.subjects.map((sub, index) => (
            <div key={sub.id} className="flex flex-wrap items-center justify-between gap-1 p-3 rounded-xl border bg-card/40">
              <label className="flex min-w-0 items-center gap-3 cursor-pointer flex-1">
                <input
                  type="checkbox"
                  checked={sub.completed}
                  onChange={() => onToggleSubject(exam.id, sub.id)}
                  className="size-4 rounded border-primary text-primary focus:ring-primary"
                />
                <span className={`min-w-0 break-words text-sm font-medium ${sub.completed ? "line-through text-muted-foreground" : ""}`}>
                  {sub.name}
                </span>
              </label>
              <Badge variant={sub.priority === "high" ? "destructive" : sub.priority === "medium" ? "default" : "secondary"}>
                {sub.priority === "high" ? "Alta" : sub.priority === "medium" ? "Média" : "Baixa"}
              </Badge>
              <button
                type="button"
                disabled={index === 0}
                aria-label={`Subir ${sub.name}`}
                className="p-2 disabled:opacity-40"
                onClick={() => onMoveSubject(index, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                disabled={index === exam.subjects.length - 1}
                aria-label={`Descer ${sub.name}`}
                className="p-2 disabled:opacity-40"
                onClick={() => onMoveSubject(index, 1)}
              >
                ↓
              </button>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6 space-y-4 shadow-none">
        <h3 className="font-semibold text-base flex items-center gap-2">
          <Calendar className="size-5 text-primary" /> Plano Automático de Revisão
        </h3>
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {!plan.length && (
            <p className="text-sm text-muted-foreground">
              {daysLeft < 0
                ? "A data da prova já passou. Edite a avaliação para gerar um novo plano."
                : "Adicione assuntos para montar o plano."}
            </p>
          )}
          {plan.map((item, index) => (
            <div key={index} className="p-3 rounded-xl border bg-card/40 flex items-center justify-between gap-2 text-sm">
              <div>
                <p className="font-semibold">Dia {item.dayIndex} ({item.dateStr})</p>
                <p className="text-muted-foreground text-xs mt-0.5">Focar em: {item.subjectName}</p>
              </div>
              <Badge variant="outline">{item.estimatedMinutes} min</Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
