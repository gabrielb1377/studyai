"use client";

import { useState } from "react";
import { AlertCircle, Bot, X } from "lucide-react";
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
import type { TutorConversation as TutorConversationType } from "@/types/tutor";
import type { StudySummary } from "@/types/summary";
import { SummaryDialog } from "@/features/summaries/SummaryDialog";
import { useSummaries } from "@/features/summaries/hooks/useSummaries";
import { SummaryService } from "@/features/summaries/services/SummaryService";
import { RetrievalPipeline } from "@/features/ai/RetrievalPipeline";
import { useTutor } from "./hooks/useTutor";
import { TutorService } from "./services/TutorService";
import { TutorComposer } from "./TutorComposer";
import { TutorConversation } from "./TutorConversation";
import { TutorSidebar } from "./TutorSidebar";

export function TutorWorkspace() {
  const {
    activeConversation,
    activeConversationId,
    conversations,
    context,
    error,
    isLoading,
    clearError,
    setError,
    createConversation,
    renameConversation,
    deleteConversation,
    selectConversation,
    sendMessage,
  } = useTutor();
  const { summaries, saveSummary, deleteSummary } = useSummaries();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [conversationToRename, setConversationToRename] = useState<TutorConversationType | null>(null);
  const [title, setTitle] = useState("");
  const [summaryDraft, setSummaryDraft] = useState<StudySummary | null>(null);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);

  const startNewConversation = () => {
    createConversation();
    setDraft("");
  };

  const openRename = (conversation: TutorConversationType) => {
    setConversationToRename(conversation);
    setTitle(conversation.title);
  };

  const closeRename = () => {
    setConversationToRename(null);
    setTitle("");
  };

  const saveRename = () => {
    if (!conversationToRename || !title.trim()) return;
    renameConversation(conversationToRename.id, title);
    closeRename();
  };

  const sendDraft = async () => {
    const sent = await sendMessage(draft);
    if (!sent) return;
    setDraft("");
  };

  const generateSummary = async () => {
    if (!activeConversation || isSummaryLoading) return;
    if (!context) {
      setError("Abra um estudo organizado antes de gerar um resumo.");
      return;
    }
    const chunks = (await RetrievalPipeline.forStudy(context.studyId)).chunks;
    if (chunks.length === 0) {
      setError("Este estudo ainda não possui conteúdo extraído para resumir.");
      return;
    }
    setIsSummaryLoading(true);
    clearError();
    try {
      const response = await TutorService.requestSummary(activeConversation.messages, context, chunks);
      const created = SummaryService.create({
        conversationId: activeConversation.id,
        conversationTitle: activeConversation.title,
        content: response.text,
        studyId: context?.studyId,
      });
      saveSummary(created);
      setSummaryDraft(created);
      setIsSummaryOpen(true);
    } catch (summaryError) {
      setError(summaryError instanceof Error ? summaryError.message : "Erro inesperado ao gerar o resumo.");
    } finally {
      setIsSummaryLoading(false);
    }
  };

  const regenerateSummary = async () => {
    if (!summaryDraft || isSummaryLoading) return;
    const conversation = conversations.find((item) => item.id === summaryDraft.conversationId);
    if (!conversation) {
      setError("A conversa de origem deste resumo não está mais disponível.");
      return;
    }
    if (!context || context.studyId !== summaryDraft.studyId) {
      setError("Abra o estudo relacionado a este resumo para atualizá-lo.");
      return;
    }
    const chunks = (await RetrievalPipeline.forStudy(context.studyId)).chunks;
    if (chunks.length === 0) {
      setError("Este estudo não possui conteúdo extraído para atualizar o resumo.");
      return;
    }
    setIsSummaryLoading(true);
    clearError();
    try {
      const response = await TutorService.requestSummary(conversation.messages, context, chunks);
      setSummaryDraft((current) => {
        if (!current) return current;
        const updated = { ...current, content: response.text, updatedAt: new Date().toISOString() };
        saveSummary(updated);
        return updated;
      });
    } catch (summaryError) {
      setError(summaryError instanceof Error ? summaryError.message : "Erro inesperado ao atualizar o resumo.");
    } finally {
      setIsSummaryLoading(false);
    }
  };

  return (
    <div className="grid h-[calc(100dvh-9rem)] min-h-[38rem] max-h-[58rem] grid-rows-[auto_minmax(0,1fr)] gap-5 overflow-hidden lg:h-[calc(100dvh-12rem)] lg:grid-cols-[15rem_minmax(0,1fr)] lg:grid-rows-1">
      <TutorSidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        query={query}
        onQueryChange={setQuery}
        onSelectConversation={selectConversation}
        onNewConversation={startNewConversation}
        onRenameConversation={openRename}
        onDeleteConversation={deleteConversation}
      />
      <section className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-primary">
            <Bot className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {activeConversation?.title ?? "Nova conversa"}
            </h2>
            <p className="text-sm text-muted-foreground">Tutor IA · Conversas salvas neste navegador</p>
            {context && (
              <p className="mt-1 text-xs font-medium text-primary">
                Utilizando contexto do tema atual
              </p>
            )}
          </div>
        </div>
        {error && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p className="flex-1">{error}</p>
            <Button type="button" variant="ghost" size="icon-sm" onClick={clearError} aria-label="Fechar erro">
              <X className="size-4" aria-hidden="true" />
            </Button>
          </div>
        )}
        {context?.document && (
          <aside className="mb-4 rounded-xl border bg-secondary/30 p-4" aria-label="Contexto identificado do documento">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span><strong>Tema:</strong> {context.document.topic ?? context.topic}</span>
              {context.document.subject && <span><strong>Disciplina:</strong> {context.document.subject}</span>}
              {context.document.language && <span><strong>Idioma:</strong> {context.document.language}</span>}
              <span><strong>Capítulos:</strong> {context.document.chapterCount}</span>
            </div>
            {context.document.summaryPreview && (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{context.document.summaryPreview}</p>
            )}
            {context.document.keywords.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                <strong className="text-foreground">Palavras-chave:</strong> {context.document.keywords.join(", ")}
              </p>
            )}
            {context.document.subtopics.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                <strong className="text-foreground">Subtemas:</strong> {context.document.subtopics.join(", ")}
              </p>
            )}
          </aside>
        )}
        {activeConversation ? (
          <>
            <TutorConversation messages={activeConversation.messages} isLoading={isLoading} />
            <TutorComposer draft={draft} isLoading={isLoading} isSummaryLoading={isSummaryLoading} onDraftChange={setDraft} onGenerateSummary={() => { void generateSummary(); }} onSend={() => { void sendDraft(); }} />
          </>
        ) : (
          <div className="rounded-xl border border-dashed p-10 text-center">
            <p className="text-sm text-muted-foreground">Crie uma conversa para começar.</p>
            <Button type="button" className="mt-4" onClick={startNewConversation}>Nova conversa</Button>
          </div>
        )}
      </section>

      <SummaryDialog
        summary={summaryDraft}
        open={isSummaryOpen}
        isLoading={isSummaryLoading}
        isSaved={summaryDraft ? summaries.some((summary) => summary.id === summaryDraft.id) : false}
        onOpenChange={setIsSummaryOpen}
        onSave={(summary) => {
          saveSummary(summary);
          setSummaryDraft(summary);
        }}
        onDelete={(summaryId) => {
          deleteSummary(summaryId);
          setIsSummaryOpen(false);
        }}
        onRegenerate={() => { void regenerateSummary(); }}
      />

      <Dialog open={conversationToRename !== null} onOpenChange={(open) => !open && closeRename()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renomear conversa</DialogTitle>
            <DialogDescription>Escolha um nome para encontrar esta conversa mais tarde.</DialogDescription>
          </DialogHeader>
          <Input aria-label="Novo nome da conversa" value={title} onChange={(event) => setTitle(event.target.value)} autoFocus />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeRename}>Cancelar</Button>
            <Button type="button" onClick={saveRename} disabled={!title.trim()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
