import Link from "next/link";
import { ArrowRight, BookOpen, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { topics } from "./data";

export function ContinueStudying() {
  const topic = topics[0];
  return (
    <section
      className="relative flex min-h-72 flex-col overflow-hidden rounded-xl border border-primary/15 bg-secondary/60 p-6 sm:p-8"
      aria-labelledby="continue-title"
    >
      <div className="relative z-10 max-w-md">
        <p className="mb-6 flex items-center gap-2 text-xs font-medium text-primary">
          <span className="size-1.5 rounded-full bg-primary" />
          CONTINUE DE ONDE PAROU
        </p>
        <p className="mb-2 text-xs text-muted-foreground">
          {topic.subject} <span className="mx-1">/</span> Tema 03
        </p>
        <h2
          id="continue-title"
          className="text-2xl font-semibold tracking-tight sm:text-[28px]"
        >
          {topic.title}
        </h2>
        <p className="mt-3 max-w-80 text-sm leading-6 text-muted-foreground">
          {topic.description}
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-4">
          <Button asChild className="h-11 px-5">
            <Link href={`/estudo?tema=${topic.id}`}>
              Continuar estudando
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <span className="text-xs text-muted-foreground">
            {topic.progress}% concluído
          </span>
        </div>
      </div>
      <div
        className="pointer-events-none absolute -right-6 top-10 hidden size-52 items-center justify-center rounded-full border border-primary/10 xl:flex"
        aria-hidden="true"
      >
        <div className="flex size-40 items-center justify-center rounded-full border border-primary/10">
          <div className="flex size-28 -rotate-12 items-center justify-center rounded-2xl border border-primary/15 bg-card/60 text-primary/60 shadow-sm">
            <BookOpen className="size-14" strokeWidth={1} />
          </div>
        </div>
        <div className="absolute bottom-2 left-3 rounded-xl border bg-card p-3 text-primary/70">
          <Layers className="size-5" strokeWidth={1.5} />
        </div>
      </div>
    </section>
  );
}
