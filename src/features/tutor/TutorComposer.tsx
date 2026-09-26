"use client";

import { useRef } from "react";
import { FileText, LoaderCircle, Paperclip, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

const tutorQuickActions = ["Explicar", "Resumir", "Flashcards", "Exercícios"];
const teacherQuickActions = ["Explique este conceito", "Dê um exemplo prático", "Faça uma pergunta", "Revise comigo"];

export function TutorComposer({ mode = "tutor", draft, isLoading, isSummaryLoading, onDraftChange, onGenerateSummary, onSend }: { mode?: "tutor" | "teacher"; draft: string; isLoading: boolean; isSummaryLoading: boolean; onDraftChange: (value: string) => void; onGenerateSummary: () => void; onSend: () => void }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const updateDraft = (value: string) => {
    onDraftChange(value);
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
    }
  };

  return (
    <div className="mt-5">
      <div className="mb-3 flex flex-wrap gap-2" aria-label="Ações rápidas">
        {(mode === "teacher" ? teacherQuickActions : tutorQuickActions).map((action) => <Button key={action} type="button" size="sm" variant="outline" onClick={() => updateDraft(mode === "teacher" ? action : `${action} este tema`)}>{action}</Button>)}
        <Button type="button" size="sm" variant="secondary" onClick={onGenerateSummary} disabled={isLoading || isSummaryLoading}>
          <FileText className="size-4" aria-hidden="true" />
          {isSummaryLoading ? "Gerando resumo..." : "Gerar resumo"}
        </Button>
      </div>
      <form className="rounded-2xl border bg-card/95 p-2 shadow-[var(--shadow-card)] transition-shadow focus-within:border-primary/35 focus-within:shadow-md" onSubmit={(event) => { event.preventDefault(); onSend(); }}>
        <textarea ref={textareaRef} aria-label="Mensagem para o Tutor IA" value={draft} onChange={(event) => updateDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (draft.trim() && !isLoading) onSend(); } }} placeholder={mode === "teacher" ? "Responda à aula ou peça outra explicação..." : "Pergunte sobre o tema que está estudando..."} rows={1} className="max-h-45 min-h-11 w-full resize-none bg-transparent px-3 py-2.5 text-sm leading-6 outline-none placeholder:text-muted-foreground" />
        <div className="flex items-center justify-between gap-3 border-t px-1 pt-2">
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Anexar arquivo (em breve)"><Paperclip className="size-4" aria-hidden="true" /></Button>
          <Button type="submit" size="sm" className="h-9" disabled={!draft.trim() || isLoading}>
            {isLoading ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
            {isLoading ? "Enviando..." : "Enviar"}
          </Button>
        </div>
      </form>
      <p className="mt-2 text-center text-xs text-muted-foreground">As respostas são geradas pelo provider selecionado e podem conter imprecisões.</p>
    </div>
  );
}
