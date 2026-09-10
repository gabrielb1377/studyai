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
    setIsSummaryLoading(true);
    clearError();
    try {
      const response = await TutorService.requestSummary(activeConversation.messages);
      setSummaryDraft(SummaryService.create({
        conversationId: activeConversation.id,
        conversationTitle: activeConversation.title,
        content: response.text,
        studyId: context?.studyId,
      }));
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
    setIsSummaryLoading(true);
    clearError();
    try {
      const response = await TutorService.requestSummary(conversation.messages);
      setSummaryDraft((current) => current ? { ...current, content: response.text, updatedAt: new Date().toISOString() } : current);
    } catch (summaryError) {
      setError(summaryError instanceof Error ? summaryError.message : "Erro inesperado ao atualizar o resumo.");
    } finally {
      setIsSummaryLoading(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
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
      <section className="min-w-0">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-primary">
            <Bot className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {activeConversation?.title ?? "Nova conversa"}
            </h2>
            <p className="text-sm text-muted-foreground">Gemini · Conversas salvas neste navegador</p>
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
