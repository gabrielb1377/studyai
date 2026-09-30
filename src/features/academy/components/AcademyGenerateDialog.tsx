"use client";

import { useMemo, useState } from "react";
import { BookOpenText, CheckCircle2, FolderKanban, Route, Sparkles, TriangleAlert, XCircle } from "lucide-react";
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
import { AcademyGenerationError, type AcademyGenerationProgress } from "../services/ContentGeneratorService";
import { academyLabels, type AcademyContentKind, type AcademyStudy } from "../types";

const options: Array<{ kind: AcademyContentKind; icon: typeof BookOpenText; description: string }> = [
  { kind: "study-material", icon: BookOpenText, description: "Apostila interna com capítulos, exemplos e atividades." },
  { kind: "learning-path", icon: Route, description: "Sequência diária com metas, aulas, revisões e checkpoints." },
  { kind: "practical-project", icon: FolderKanban, description: "Projeto guiado com etapas, desafios e critérios de conclusão." },
];

const stageLabels = {
  preparing: "Preparando prompt",
  "calling-ai": "Chamando IA",
  structuring: "Estruturando conteúdo",
  "saving-library": "Salvando na Biblioteca",
  "updating-learning": "Atualizando Learning Engine",
  completed: "Finalizado",
} as const;

type GenerationErrorDetails = {
  message: string;
  code?: string;
  provider?: string;
  suggestion?: string;
};

export function AcademyGenerateDialog({ study, open, onOpenChange, onGenerate, onCancel, isGenerating, progress }: {
  study: AcademyStudy;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (kind: AcademyContentKind, force?: boolean) => Promise<unknown>;
  onCancel: () => void;
  isGenerating: boolean;
  progress?: AcademyGenerationProgress;
}) {
  const [kind, setKind] = useState<AcademyContentKind>("study-material");
  const [error, setError] = useState<GenerationErrorDetails>();
  const estimate = useMemo(() => estimateAcademyGeneration(study, kind), [study, kind]);
  const hasExisting = study.contents.some((content) => content.kind === kind);

  async function generate(force = false) {
    setError(undefined);
    try {
      await onGenerate(kind, force);
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof AcademyGenerationError ? {
        message: cause.message,
        code: cause.code,
        provider: cause.provider,
        suggestion: cause.suggestion,
      } : { message: cause instanceof Error ? cause.message : "Não foi possível gerar o conteúdo." });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isGenerating && onOpenChange(next)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Gerar conteúdo para {study.topic}</DialogTitle>
          <DialogDescription>A geração livre usa o provider configurado no AI Core e não depende de PDFs, chunks ou materiais existentes.</DialogDescription>
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
        {progress ? (
          <div className="space-y-2 rounded-xl border p-4" aria-live="polite">
            <div className="flex items-center justify-between text-sm"><span className="flex items-center gap-2 font-medium">{progress.state === "success" ? <CheckCircle2 className="size-4 text-emerald-600" /> : progress.state === "error" || progress.state === "cancelled" ? <XCircle className="size-4 text-destructive" /> : <Sparkles className="size-4 animate-pulse text-primary" />}{stageLabels[progress.stage]}</span><span>{Math.round((progress.completedStages / progress.totalStages) * 100)}%</span></div>
            <Progress value={(progress.completedStages / progress.totalStages) * 100} />
            {progress.detail ? <p className="text-xs text-muted-foreground">{progress.detail}</p> : null}
          </div>
        ) : null}
        {error ? (
          <div role="alert" className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <p className="font-medium">{error.message}</p>
            {error.provider || error.code ? <p className="text-xs">{error.provider ? `Provider: ${error.provider}. ` : ""}{error.code ? `Tipo: ${error.code}.` : ""}</p> : null}
            {error.suggestion ? <p className="text-xs text-muted-foreground">{error.suggestion}</p> : null}
            {error.code !== "CANCELLED" ? <Button type="button" size="sm" variant="outline" onClick={() => void generate(true)}>Tentar novamente</Button> : null}
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => isGenerating ? onCancel() : onOpenChange(false)}>{isGenerating ? "Cancelar geração" : "Cancelar"}</Button>
          {hasExisting ? <Button type="button" variant="secondary" onClick={() => void generate(true)} disabled={isGenerating}>{isGenerating ? "Gerando..." : "Gerar nova versão"}</Button> : null}
          <Button type="button" onClick={() => void generate(false)} disabled={isGenerating}>{isGenerating ? "Gerando..." : hasExisting ? "Reutilizar existente" : "Gerar conteúdo"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
