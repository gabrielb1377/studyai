"use client";

import { BrainCircuit, ClipboardCheck, NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SummaryList } from "@/features/summaries/SummaryList";
import type { StudyTool } from "@/types/study";

const toolIcons = { flashcards: BrainCircuit, quiz: ClipboardCheck, notes: NotebookPen };

export function StudyToolsTab({ tools }: { tools: readonly StudyTool[] }) {
  return (
    <section aria-labelledby="study-tools-title" className="space-y-5">
      <div>
        <h2 id="study-tools-title" className="text-lg font-semibold tracking-tight">Como você quer estudar?</h2>
        <p className="mt-1 text-sm text-muted-foreground">Escolha uma ferramenta para continuar quando ela estiver disponível.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {tools.map((tool) => {
          const Icon = toolIcons[tool.id];
          return (
            <Card key={tool.id} className="gap-0 p-5 shadow-none">
              <span className="mb-5 flex size-10 items-center justify-center rounded-lg bg-secondary text-primary"><Icon className="size-5" strokeWidth={1.5} aria-hidden="true" /></span>
              <h3 className="text-base font-semibold">{tool.title}</h3>
              <p className="mt-2 min-h-10 text-sm leading-5 text-muted-foreground">{tool.description}</p>
              <CardContent className="mt-5 p-0"><Button type="button" variant="outline" className="w-full" disabled>Abrir</Button></CardContent>
            </Card>
          );
        })}
      </div>
      <SummaryList />
    </section>
  );
}
