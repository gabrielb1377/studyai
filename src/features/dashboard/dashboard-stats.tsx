import { BookOpenCheck, BookText, ClipboardCheck, Clock3, FileSearch, FileStack, Gauge, Layers3, ListTree } from "lucide-react";

import { Card } from "@/components/ui/card";
import type { Flashcard } from "@/types/flashcard";
import type { Material } from "@/types/material";
import type { QuizResult } from "@/types/quiz";
import type { StudyRecord } from "@/types/study-engine";
import type { ExtractedContent } from "@/features/extraction/ExtractionTypes";

export function DashboardStats({
  materials,
  studies,
  flashcards,
  quizzes,
  contents,
  advanced = false,
}: {
  materials: readonly Material[];
  studies: readonly StudyRecord[];
  flashcards: readonly Flashcard[];
  quizzes: readonly QuizResult[];
  contents: readonly ExtractedContent[];
  advanced?: boolean;
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
    {
      label: "Materiais analisados",
      value: contents.filter((content) => content.metadata.analysisStatus === "analyzed").length,
      icon: FileSearch,
    },
    { label: "Temas criados", value: studies.filter((study) => study.analysisStatus).length, icon: BookText },
    {
      label: "Capítulos identificados",
      value: contents.reduce((total, content) => total + (content.metadata.chapters?.length ?? 0), 0),
      icon: ListTree,
    },
    {
      label: "Tempo total de leitura",
      value: `${contents.reduce((total, content) => total + (content.metadata.readingTimeMinutes ?? 0), 0)} min`,
      icon: Clock3,
    },
  ];
  const visibleStats = advanced ? stats : stats.slice(0, 5);

  return (
    <section aria-label="Resumo dos dados de estudo" className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-5">
      {visibleStats.map(({ label, value, icon: Icon }) => (
        <Card key={label} className="min-w-[10rem] snap-start gap-3 p-4 sm:min-w-0">
          <span className="flex size-8 items-center justify-center rounded-xl bg-secondary text-primary">
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
