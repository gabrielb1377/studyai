import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Topic } from "@/types/study";

export function StudyHeader({ topic }: { topic: Topic }) {
  return (
    <header className="mb-8 border-b pb-7 sm:mb-10 sm:pb-8">
      <nav aria-label="Breadcrumb" className="mb-5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <Link href="/" className="shrink-0 transition-colors hover:text-foreground">
          Dashboard
        </Link>
        <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{topic.subject}</span>
        <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate text-foreground" aria-current="page">
          {topic.title}
        </span>
      </nav>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {topic.subject}
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-[36px]">
            {topic.title}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {topic.description}
          </p>
        </div>
        <Button asChild variant="outline" className="h-10 shrink-0 self-start sm:self-auto">
          <Link href="/">
            <ArrowLeft className="size-4" />
            Voltar
          </Link>
        </Button>
      </div>
    </header>
  );
}
