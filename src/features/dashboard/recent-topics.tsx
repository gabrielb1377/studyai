import Link from "next/link";
import { ArrowRight, BookOpen, Clock3 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { Flashcard } from "@/types/flashcard";
import type { StudyNote } from "@/types/note";
import type { QuizResult } from "@/types/quiz";
import type { StudyRecord } from "@/types/study-engine";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function RecentTopics({ records, flashcards, quizzes, notes }: {
  records: readonly StudyRecord[];
  flashcards: readonly Flashcard[];
  quizzes: readonly QuizResult[];
  notes: readonly StudyNote[];
}) {
  const recentTopics = [...records]
    .sort((a, b) => b.lastAccessedAt.localeCompare(a.lastAccessedAt))
    .slice(0, 6);

  return (
    <section aria-labelledby="recent-title">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 id="recent-title" className="text-lg font-semibold tracking-tight">Últimos temas</h2>
        <Link href="/biblioteca" className="flex min-h-10 items-center gap-1.5 text-xs text-muted-foreground hover:text-primary">
          Ver biblioteca<ArrowRight className="size-3.5" />
        </Link>
      </div>
      {recentTopics.length === 0 ? (
        <Card className="items-center gap-3 p-8 text-center shadow-none">
          <BookOpen className="size-8 text-muted-foreground" aria-hidden="true" />
          <h3 className="font-medium">Nenhum tema estudado ainda</h3>
          <p className="max-w-md text-sm text-muted-foreground">
            Os temas aparecerão aqui depois que materiais reais forem organizados.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {recentTopics.map((record) => {
            const flashcardCount = flashcards.filter((card) => card.studyId === record.studyId).length;
            const topicQuizzes = quizzes.filter((quiz) => quiz.studyId === record.studyId).sort((a, b) => b.completedAt.localeCompare(a.completedAt));
            const topicNotes = notes.filter((note) => note.studyId === record.studyId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

            return (
              <Link key={record.studyId} href={`/estudo?tema=${record.studyId}`} className="group rounded-xl">
                <Card className="h-full gap-0 p-5 shadow-none transition-[border-color,transform,box-shadow] hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-sm">
                  <div className="mb-5 flex items-center justify-between">
                    <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-primary">
                      <BookOpen className="size-5" strokeWidth={1.5} />
                    </span>
                    <ArrowRight className="size-4 text-muted-foreground/60 transition-transform group-hover:translate-x-1" />
                  </div>
                  <Badge variant="secondary" className="mb-2 w-fit text-[10px] font-normal">{record.subject}</Badge>
                  <h3 className="text-sm font-semibold">{record.title}</h3>
                  <div className="mt-5 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Progresso</span><span>{record.progress}%</span>
                  </div>
                  <div role="progressbar" aria-label={`Progresso em ${record.title}`} aria-valuenow={record.progress} aria-valuemin={0} aria-valuemax={100} className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary/70" style={{ width: `${record.progress}%` }} />
                  </div>
                  <p className="mt-4 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Clock3 className="size-3" />{dateFormatter.format(new Date(record.lastAccessedAt))}
                  </p>
                  <p className="mt-2 text-[11px] text-muted-foreground">{flashcardCount} flashcards</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{topicQuizzes.length} quizzes{topicQuizzes[0] ? ` · último resultado: ${topicQuizzes[0].score}%` : ""}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{topicNotes.length} notas{topicNotes[0] ? ` · última edição: ${dateFormatter.format(new Date(topicNotes[0].updatedAt))}` : ""}</p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
