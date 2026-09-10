import Link from "next/link";
import { ArrowRight, Braces, Clock3, Database, Shapes } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { StudyRecord } from "@/types/study-engine";
import type { Flashcard } from "@/types/flashcard";
import { topics } from "./data";

const icons = [Braces, Database, Shapes];

export function RecentTopics({ records, flashcards }: { records: readonly StudyRecord[]; flashcards: readonly Flashcard[] }) {
  const recentTopics = records.length
    ? [...records].sort((a, b) => b.lastAccessedAt.localeCompare(a.lastAccessedAt)).map((record) => ({ topic: topics.find((item) => item.id === record.studyId), record })).filter((item): item is { topic: typeof topics[number]; record: StudyRecord } => Boolean(item.topic))
    : topics.map((topic) => ({ topic, record: undefined }));
  return (
    <section aria-labelledby="recent-title">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 id="recent-title" className="text-lg font-semibold tracking-tight">
          Últimos temas
        </h2>
        <Link
          href="/biblioteca"
          className="flex min-h-10 items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
        >
          Ver biblioteca
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {recentTopics.map(({ topic, record }, index) => {
          const Icon = icons[index];
          const flashcardCount = flashcards.filter((card) => card.studyId === topic.id).length;
          return (
            <Link
              key={topic.id}
              href={`/estudo?tema=${topic.id}`}
              className="group rounded-xl"
            >
              <Card className="h-full gap-0 p-5 shadow-none transition-[border-color,transform,box-shadow] hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-sm">
                <div className="mb-5 flex items-center justify-between">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-primary">
                    <Icon className="size-5" strokeWidth={1.5} />
                  </span>
                  <ArrowRight className="size-4 text-muted-foreground/60 transition-transform group-hover:translate-x-1" />
                </div>
                <Badge
                  variant="secondary"
                  className="mb-2 w-fit text-[10px] font-normal"
                >
                  {topic.subject}
                </Badge>
                <h3 className="text-sm font-semibold">{topic.title}</h3>
                <div className="mt-5 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Progresso</span>
                  <span>{record?.progress ?? topic.progress}%</span>
                </div>
                <div
                  role="progressbar"
                  aria-label={`Progresso em ${topic.title}`}
                  aria-valuenow={record?.progress ?? topic.progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="mt-2 h-1 overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="h-full rounded-full bg-primary/70"
                    style={{ width: `${record?.progress ?? topic.progress}%` }}
                  />
                </div>
                <p className="mt-4 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Clock3 className="size-3" />
                  {record ? "Acessado recentemente" : topic.lastStudied}
                </p>
                <p className="mt-2 text-[11px] text-muted-foreground">{flashcardCount} flashcards</p>
              </Card>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
