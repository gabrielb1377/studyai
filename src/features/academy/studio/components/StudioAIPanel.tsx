"use client";

import { useEffect, useState } from "react";
import { Check, Sparkles, Wand2, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useStudioAssist } from "../hooks/useStudioAssist";
import type { StudioAssistAction } from "../services/StudioAssistClient";

const ACTIONS: { id: StudioAssistAction; label: string; description: string }[] = [
  { id: "improve-writing", label: "Melhorar redação", description: "Clareza e fluidez sem alterar o significado" },
  { id: "summarize", label: "Resumir", description: "Versão condensada mantendo os conceitos" },
  { id: "expand", label: "Expandir", description: "Mais detalhes, exemplos e contexto" },
  { id: "simplify", label: "Simplificar", description: "Linguagem acessível para iniciantes" },
  { id: "create-example", label: "Criar exemplo", description: "Exemplo prático sobre o texto" },
  { id: "create-exercise", label: "Gerar exercício", description: "Questão com resposta e justificativa" },
  { id: "reorganize", label: "Reorganizar conteúdo", description: "Sequência didática mais lógica" },
];

interface StudioAIPanelProps {
  /** Texto alvo: seção ou slide selecionado. */
  text: string;
  /** Rótulo do alvo (ex.: "Seção: Conceitos principais"). */
  targetLabel: string;
  /** Contexto adicional (título do documento, objetivo). */
  context?: string;
  /** Aplica a sugestão aceita pelo aluno. */
  onApply: (text: string) => void;
}

export function StudioAIPanel({ text, targetLabel, context, onApply }: StudioAIPanelProps) {
  const { isLoading, error, proposal, request, dismiss } = useStudioAssist();
  const [draft, setDraft] = useState(text);

  useEffect(() => {
    setDraft(text);
  }, [text]);

  const run = (action: StudioAssistAction) => {
    const source = draft.trim();
    if (!source) return;
    void request({ action, text: source, context });
  };

  return (
    <div className="space-y-3 p-2">
      <div className="rounded-xl bg-muted/40 p-3">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Alvo</p>
        <p className="mt-1 text-sm font-medium">{targetLabel}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {draft.length} caracteres. O conteúdo original só muda depois da sua confirmação.
        </p>
      </div>

      <label className="block space-y-1 text-[11px] font-medium text-muted-foreground">
        Texto de trabalho
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={7}
          className="text-xs leading-5"
          placeholder="Selecione um trecho no editor ou digite o texto a ser reescrito."
        />
      </label>

      <div className="space-y-1.5">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Ações</p>
        <ul className="grid gap-1.5">
          {ACTIONS.map((action) => (
            <li key={action.id}>
              <button
                type="button"
                disabled={isLoading || !draft.trim()}
                onClick={() => run(action.id)}
                className="flex w-full items-start gap-2 rounded-xl border p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50"
              >
                <Wand2 className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-xs font-medium">{action.label}</span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">{action.description}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {isLoading ? (
        <p className="flex items-center gap-2 rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
          <Sparkles className="size-3.5 animate-pulse" aria-hidden="true" /> Consultando a IA…
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> {error}
        </p>
      ) : null}

      {proposal ? (
        <section className="space-y-2 rounded-xl border border-primary/40 bg-primary/5 p-3" aria-labelledby="studio-ai-proposal">
          <h4 id="studio-ai-proposal" className="flex items-center gap-1.5 text-xs font-semibold">
            <Sparkles className="size-3.5 text-primary" aria-hidden="true" /> Proposta da IA
          </h4>
          <ScrollArea className="max-h-52 rounded-lg border bg-background/70 p-2">
            <p className="whitespace-pre-wrap text-xs leading-5">{proposal.suggestedText}</p>
          </ScrollArea>
          <p className="text-[11px] text-muted-foreground">{proposal.explanation}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onApply(proposal.suggestedText);
                dismiss();
              }}
            >
              <Check className="size-3.5 me-1" aria-hidden="true" /> Aplicar sugestão
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={dismiss}>
              <X className="size-3.5 me-1" aria-hidden="true" /> Descartar
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
