"use client";

import { BarChart3, BookOpenCheck, Clock3, Layers3, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSummaries } from "@/features/summaries/hooks/useSummaries";
import type { StudyRecord, StudyStatus } from "@/types/study-engine";
import type { Flashcard } from "@/types/flashcard";
import type { QuizResult } from "@/types/quiz";
import { useLearningEngine } from "@/features/learning/hooks/useLearningEngine";

const statusLabels: Record<StudyStatus, string> = {
  not_started: "Não iniciado",
  in_progress: "Em andamento",
  completed: "Concluído",
};

function formatLastAccess(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function StudyStatistics({
  record,
  flashcards,
  quizzes,
  onProgressChange,
  onStatusChange,
}: {
  record: StudyRecord;
  flashcards: readonly Flashcard[];
  quizzes: readonly QuizResult[];
  onProgressChange: (progress: number) => void;
  onStatusChange: (status: StudyStatus) => void;
}) {
  const { summaries } = useSummaries(record.studyId);
  const summaryCount = summaries.length;
  const { profile, knowledge, priorities } = useLearningEngine([record], flashcards, quizzes);
  const topicLearning = profile.topics[record.studyId];
  const score = knowledge[0];
  const priority = priorities[0];

  return (
    <section aria-labelledby="study-statistics-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="study-statistics-title" className="text-lg font-semibold tracking-tight">Estatísticas</h2>
          <p className="mt-1 text-sm text-muted-foreground">Acompanhe o avanço deste tema.</p>
        </div>
        <select aria-label="Status do estudo" value={record.status} onChange={(event) => onStatusChange(event.target.value as StudyStatus)} className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring">
          {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Card className="gap-1 p-4 shadow-none"><span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-primary"><Clock3 className="size-4" /></span><p className="mt-3 text-xs text-muted-foreground">Tempo estudado</p><p className="text-sm font-medium">{Math.round(topicLearning?.timeMinutes ?? 0)} min</p></Card>
        <Card className="gap-1 p-4 shadow-none"><span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-primary"><BookOpenCheck className="size-4" /></span><p className="mt-3 text-xs text-muted-foreground">Último acesso</p><p className="text-sm font-medium leading-5">{formatLastAccess(record.lastAccessedAt)}</p></Card>
        <Card className="gap-1 p-4 shadow-none"><span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-primary"><BarChart3 className="size-4" /></span><p className="mt-3 text-xs text-muted-foreground">Progresso</p><p className="text-xl font-semibold">{record.progress}%</p></Card>
        <Card className="gap-1 p-4 shadow-none"><span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-primary"><Sparkles className="size-4" /></span><p className="mt-3 text-xs text-muted-foreground">Resumos</p><p className="text-xl font-semibold">{summaryCount}</p></Card>
        <Card className="gap-1 p-4 shadow-none"><span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-primary"><Layers3 className="size-4" /></span><p className="mt-3 text-xs text-muted-foreground">Flashcards</p><p className="text-xl font-semibold">{flashcards.length}</p></Card>
        <Card className="gap-1 p-4 shadow-none"><span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-primary"><Layers3 className="size-4" /></span><p className="mt-3 text-xs text-muted-foreground">Quiz</p><p className="text-xl font-semibold">{quizzes.length}</p></Card>
      </div>
      {score && priority && <Card className="gap-4 p-4 shadow-none" aria-label={`Aprendizagem em ${record.title}`}><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">Conhecimento do tema</p><p className="text-xs text-muted-foreground">Calculado por desempenho, tempo, frequência e recência.</p></div><Badge variant={priority.level === "Alta" ? "destructive" : "secondary"}>Prioridade {priority.level}</Badge></div><div className="grid gap-3 text-center sm:grid-cols-3"><p><strong className="text-xl">{score.knowledge}%</strong><br /><span className="text-xs text-muted-foreground">Conhecimento</span></p><p><strong className="text-xl">{score.confidence}%</strong><br /><span className="text-xs text-muted-foreground">Confiança</span></p><p><strong>{score.mastery}</strong><br /><span className="text-xs text-muted-foreground">Domínio</span></p></div><p className="text-xs text-muted-foreground">{priority.reasons.join(" · ")}</p></Card>}
      <Card className="gap-3 p-4 shadow-none">
        <div className="flex items-center justify-between gap-3 text-sm"><span className="font-medium">Ajustar progresso</span><span className="text-muted-foreground">{record.progress}%</span></div>
        <input aria-label="Progresso do estudo" type="range" min="0" max="100" step="5" value={record.progress} onChange={(event) => onProgressChange(Number(event.target.value))} className="w-full accent-primary" />
      </Card>
    </section>
  );
}
