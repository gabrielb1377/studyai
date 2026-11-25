"use client";

import { Badge } from "@/components/ui/badge";
import { daysUntilExam } from "../ExamService";
import type { Exam } from "@/types/exam";

export function ExamListSidebar({
  exams,
  selectedExamId,
  onSelectExam,
}: {
  exams: readonly Exam[];
  selectedExamId: string | null;
  onSelectExam: (id: string) => void;
}) {
  return (
    <div className="min-w-0 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
        Suas Provas
      </p>
      {exams.map((exam) => {
        const active = exam.id === selectedExamId;
        const dLeft = daysUntilExam(exam.examDate) ?? 0;
        return (
          <button
            key={exam.id}
            type="button"
            onClick={() => onSelectExam(exam.id)}
            className={`w-full text-left p-4 rounded-xl border transition-all ${
              active
                ? "border-primary bg-accent/60 font-semibold shadow-sm"
                : "bg-card hover:bg-accent/30 text-muted-foreground"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">{exam.discipline}</span>
              <Badge variant={dLeft < 0 ? "destructive" : dLeft <= 3 ? "default" : "secondary"}>
                {dLeft < 0 ? "Realizada" : dLeft === 0 ? "Hoje!" : `${dLeft} dias`}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1 truncate">{exam.title}</p>
          </button>
        );
      })}
    </div>
  );
}
