"use client";

import { useEffect, useState } from "react";
import { Clipboard, RefreshCw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { StudySummary } from "@/types/summary";

export function SummaryDialog({
  summary,
  open,
  isLoading = false,
  isSaved,
  onOpenChange,
  onSave,
  onDelete,
  onRegenerate,
}: {
  summary: StudySummary | null;
  open: boolean;
  isLoading?: boolean;
  isSaved: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (summary: StudySummary) => void;
  onDelete?: (summaryId: string) => void;
  onRegenerate?: () => void;
}) {
  const [title, setTitle] = useState("");
  const [hasCopied, setHasCopied] = useState(false);

  useEffect(() => {
    if (summary) setTitle(summary.title);
    setHasCopied(false);
  }, [summary]);

  if (!summary) return null;

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(summary.content);
      setHasCopied(true);
    } catch {
      setHasCopied(false);
    }
  };

  const saveSummary = () => {
    const nextTitle = title.trim();
    if (!nextTitle) return;
    onSave({ ...summary, title: nextTitle });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Resumo inteligente</DialogTitle>
          <DialogDescription>Gerado a partir da conversa selecionada no Tutor IA.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label htmlFor="summary-title" className="text-sm font-medium">Título</label>
          <Input id="summary-title" aria-label="Título do resumo" value={title} onChange={(event) => setTitle(event.target.value)} />
        </div>
        <article className="max-h-[45dvh] overflow-y-auto whitespace-pre-wrap rounded-xl border bg-muted/30 p-4 text-sm leading-7 text-foreground" aria-label="Conteúdo do resumo">
          {summary.content}
        </article>
        <DialogFooter className="sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => { void copySummary(); }}>
              <Clipboard className="size-4" aria-hidden="true" />
              {hasCopied ? "Copiado" : "Copiar"}
            </Button>
            {onRegenerate && (
              <Button type="button" variant="outline" size="sm" onClick={onRegenerate} disabled={isLoading}>
                <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} aria-hidden="true" />
                Atualizar resumo
              </Button>
            )}
            {isSaved && onDelete && (
              <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => onDelete(summary.id)}>
                <Trash2 className="size-4" aria-hidden="true" />Excluir
              </Button>
            )}
          </div>
          <Button type="button" onClick={saveSummary} disabled={!title.trim()}>
            <Save className="size-4" aria-hidden="true" />
            {isSaved ? "Salvar alterações" : "Salvar resumo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
