"use client";

import { useMemo, useState } from "react";
import { BookOpenText, FolderKanban, Route, Sparkles, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { estimateAcademyGeneration } from "../services/AcademyTokenBudget";
import type { AcademyGenerationProgress } from "../services/ContentGeneratorService";
import { academyLabels, type AcademyContentKind, type AcademyStudy } from "../types";

const options: Array<{ kind: AcademyContentKind; icon: typeof BookOpenText; description: string }> = [
  { kind: "study-material", icon: BookOpenText, description: "Apostila interna com capítulos, exemplos e atividades." },
  { kind: "learning-path", icon: Route, description: "Sequência diária com metas, aulas, revisões e checkpoints." },
  { kind: "practical-project", icon: FolderKanban, description: "Projeto guiado com etapas, desafios e critérios de conclusão." },
];

const stageLabels = { outline: "Planejando estrutura", lessons: "Criando capítulos", practice: "Montando atividades" } as const;

export function AcademyGenerateDialog({ study, open, onOpenChange, onGenerate, isGenerating, progress }: {
  study: AcademyStudy;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (kind: AcademyContentKind, force?: boolean) => Promise<unknown>;
  isGenerating: boolean;
  progress?: AcademyGenerationProgress;
}) {
  const [kind, setKind] = useState<AcademyContentKind>("study-material");
  const [error, setError] = useState<string>();
  const estimate = useMemo(() => estimateAcademyGeneration(study, kind), [study, kind]);
  const hasExisting = study.contents.some((content) => content.kind === kind);

  async function generate(force = false) {
    setError(undefined);
    try {
      await onGenerate(kind, force);
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível gerar o conteúdo.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isGenerating && onOpenChange(next)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Gerar conteúdo para {study.topic}</DialogTitle>
          <DialogDescription>A geração usa o provider configurado no AI Core e acontece em três etapas para manter a consistência.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Tipo de conteúdo">
          {options.map((option) => {
            const Icon = option.icon;
            const selected = kind === option.kind;
            return (
              <button key={option.kind} type="button" role="radio" aria-checked={selected} disabled={isGenerating} onClick={() => setKind(option.kind)} className={`rounded-2xl border p-4 text-left transition-colors ${selected ? "border-primary bg-primary/5 ring-2 ring-primary/15" : "hover:border-primary/30 hover:bg-secondary/40"}`}>
                <Icon className="mb-3 size-5 text-primary" aria-hidden="true" />
                <span className="block text-sm font-semibold">{academyLabels.contentKinds[option.kind]}</span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">{option.description}</span>
              </button>
            );
          })}
        </div>
        {estimate.isLong ? (
          <div className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
            <p>Conteúdo longo: estimativa de até {estimate.estimatedOutputTokens.toLocaleString("pt-BR")} tokens. Ele será dividido em {estimate.stages} etapas.</p>
          </div>
        ) : null}
        {hasExisting && !isGenerating ? <p className="rounded-xl bg-secondary/55 p-3 text-sm text-muted-foreground">Já existe uma versão deste tipo. Você pode abri-la ou gerar uma nova versão.</p> : null}
        {isGenerating && progress ? (
          <div className="space-y-2 rounded-xl border p-4" aria-live="polite">
            <div className="flex items-center justify-between text-sm"><span className="flex items-center gap-2 font-medium"><Sparkles className="size-4 animate-pulse text-primary" />{stageLabels[progress.stage]}</span><span>{Math.round((progress.completedStages / progress.totalStages) * 100)}%</span></div>
            <Progress value={(progress.completedStages / progress.totalStages) * 100} />
          </div>
        ) : null}
        {error ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isGenerating}>Cancelar</Button>
          {hasExisting ? <Button type="button" variant="secondary" onClick={() => void generate(true)} disabled={isGenerating}>{isGenerating ? "Gerando..." : "Gerar nova versão"}</Button> : null}
          <Button type="button" onClick={() => void generate(false)} disabled={isGenerating}>{isGenerating ? "Gerando..." : hasExisting ? "Reutilizar existente" : "Gerar conteúdo"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
