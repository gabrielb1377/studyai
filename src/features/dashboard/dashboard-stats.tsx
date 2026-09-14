import { BookOpenCheck, ClipboardCheck, FileStack, Gauge, Layers3 } from "lucide-react";

import { Card } from "@/components/ui/card";
import type { Flashcard } from "@/types/flashcard";
import type { Material } from "@/types/material";
import type { QuizResult } from "@/types/quiz";
import type { StudyRecord } from "@/types/study-engine";

export function DashboardStats({
  materials,
  studies,
  flashcards,
  quizzes,
}: {
  materials: readonly Material[];
  studies: readonly StudyRecord[];
  flashcards: readonly Flashcard[];
  quizzes: readonly QuizResult[];
}) {
  const averageProgress = studies.length
    ? Math.round(studies.reduce((total, study) => total + study.progress, 0) / studies.length)
    : 0;
  const stats = [
    { label: "Arquivos", value: materials.length, icon: FileStack },
    { label: "Estudos", value: studies.length, icon: BookOpenCheck },
    { label: "Progresso médio", value: `${averageProgress}%`, icon: Gauge },
    { label: "Flashcards", value: flashcards.length, icon: Layers3 },
    { label: "Quizzes concluídos", value: quizzes.length, icon: ClipboardCheck },
  ];

  return (
    <section aria-label="Resumo dos dados de estudo" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {stats.map(({ label, value, icon: Icon }) => (
        <Card key={label} className="gap-3 p-4 shadow-none">
          <span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-primary">
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-semibold tracking-tight">{value}</p>
          </div>
        </Card>
      ))}
    </section>
  );
}
