"use client";

import { useState } from "react";
import { Bot } from "lucide-react";
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
import { useTutor } from "./hooks/useTutor";
import { TutorComposer } from "./TutorComposer";
import { TutorConversation } from "./TutorConversation";
import { TutorSidebar } from "./TutorSidebar";

export function TutorWorkspace() {
  const {
    activeConversation,
    activeConversationId,
    conversations,
    createConversation,
    renameConversation,
    deleteConversation,
    selectConversation,
    sendMessage,
  } = useTutor();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [conversationToRename, setConversationToRename] = useState<TutorConversationType | null>(null);
  const [title, setTitle] = useState("");

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

  const sendDraft = () => {
    sendMessage(draft);
    setDraft("");
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
            <p className="text-sm text-muted-foreground">Tutor IA · Conversas salvas neste navegador</p>
          </div>
        </div>
        {activeConversation ? (
          <>
            <TutorConversation messages={activeConversation.messages} />
            <TutorComposer draft={draft} onDraftChange={setDraft} onSend={sendDraft} />
          </>
        ) : (
          <div className="rounded-xl border border-dashed p-10 text-center">
            <p className="text-sm text-muted-foreground">Crie uma conversa para começar.</p>
            <Button type="button" className="mt-4" onClick={startNewConversation}>Nova conversa</Button>
          </div>
        )}
      </section>

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
