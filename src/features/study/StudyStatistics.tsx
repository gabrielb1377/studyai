"use client";

import { BarChart3, BookOpenCheck, Clock3, Layers3, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useSummaries } from "@/features/summaries/hooks/useSummaries";
import type { StudyRecord, StudyStatus } from "@/types/study-engine";

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
  flashcardCount,
  quizCount,
  onProgressChange,
  onStatusChange,
}: {
  record: StudyRecord;
  flashcardCount: number;
  quizCount: number;
  onProgressChange: (progress: number) => void;
  onStatusChange: (status: StudyStatus) => void;
}) {
  const { summaries } = useSummaries(record.studyId);
  const summaryCount = summaries.length;

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
        <Card className="gap-1 p-4 shadow-none"><span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-primary"><Clock3 className="size-4" /></span><p className="mt-3 text-xs text-muted-foreground">Tempo estudado</p><p className="text-sm font-medium">Não registrado</p></Card>
        <Card className="gap-1 p-4 shadow-none"><span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-primary"><BookOpenCheck className="size-4" /></span><p className="mt-3 text-xs text-muted-foreground">Último acesso</p><p className="text-sm font-medium leading-5">{formatLastAccess(record.lastAccessedAt)}</p></Card>
        <Card className="gap-1 p-4 shadow-none"><span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-primary"><BarChart3 className="size-4" /></span><p className="mt-3 text-xs text-muted-foreground">Progresso</p><p className="text-xl font-semibold">{record.progress}%</p></Card>
        <Card className="gap-1 p-4 shadow-none"><span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-primary"><Sparkles className="size-4" /></span><p className="mt-3 text-xs text-muted-foreground">Resumos</p><p className="text-xl font-semibold">{summaryCount}</p></Card>
        <Card className="gap-1 p-4 shadow-none"><span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-primary"><Layers3 className="size-4" /></span><p className="mt-3 text-xs text-muted-foreground">Flashcards</p><p className="text-xl font-semibold">{flashcardCount}</p></Card>
        <Card className="gap-1 p-4 shadow-none"><span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-primary"><Layers3 className="size-4" /></span><p className="mt-3 text-xs text-muted-foreground">Quiz</p><p className="text-xl font-semibold">{quizCount}</p></Card>
      </div>
      <Card className="gap-3 p-4 shadow-none">
        <div className="flex items-center justify-between gap-3 text-sm"><span className="font-medium">Ajustar progresso</span><span className="text-muted-foreground">{record.progress}%</span></div>
        <input aria-label="Progresso do estudo" type="range" min="0" max="100" step="5" value={record.progress} onChange={(event) => onProgressChange(Number(event.target.value))} className="w-full accent-primary" />
      </Card>
    </section>
  );
}
