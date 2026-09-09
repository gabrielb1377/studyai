"use client";

import { useState } from "react";
import { Bot } from "lucide-react";
import { tutorConversations, tutorMessages } from "@/lib/mock/tutor";
import type { TutorMessage } from "@/types/tutor";
import { TutorComposer } from "./TutorComposer";
import { TutorConversation } from "./TutorConversation";
import { TutorSidebar } from "./TutorSidebar";

export function TutorWorkspace() {
  const [activeConversationId, setActiveConversationId] = useState(tutorConversations[0].id);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<TutorMessage[]>([...tutorMessages]);

  const startNewConversation = () => {
    setActiveConversationId("new");
    setMessages([{ id: "new-welcome", role: "assistant", content: "Nova conversa iniciada. Como posso ajudar no seu estudo?" }]);
    setDraft("");
  };

  const selectConversation = (id: string) => {
    setActiveConversationId(id);
    setMessages([...tutorMessages]);
  };

  const sendMessage = () => {
    const content = draft.trim();
    if (!content) return;
    setMessages((current) => [...current, { id: `user-${Date.now()}`, role: "user", content }, { id: `assistant-${Date.now()}`, role: "assistant", content: "Resposta simulada: a integração do Tutor IA será implementada em uma próxima sprint." }]);
    setDraft("");
  };

  const activeConversation = tutorConversations.find((conversation) => conversation.id === activeConversationId);
  return (
    <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <TutorSidebar conversations={tutorConversations} activeConversationId={activeConversationId} query={query} onQueryChange={setQuery} onSelectConversation={selectConversation} onNewConversation={startNewConversation} />
      <section className="min-w-0">
        <div className="mb-5 flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-primary"><Bot className="size-5" aria-hidden="true" /></span><div><h2 className="text-lg font-semibold tracking-tight">{activeConversation?.title ?? "Nova conversa"}</h2><p className="text-sm text-muted-foreground">Tutor IA · Interface mockada</p></div></div>
        <TutorConversation messages={messages} />
        <TutorComposer draft={draft} onDraftChange={setDraft} onSend={sendMessage} />
      </section>
    </div>
  );
}
