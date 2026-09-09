"use client";

import { MessageSquarePlus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TutorConversation } from "@/types/tutor";

export function TutorSidebar({
  conversations,
  activeConversationId,
  query,
  onQueryChange,
  onSelectConversation,
  onNewConversation,
}: {
  conversations: readonly TutorConversation[];
  activeConversationId: string;
  query: string;
  onQueryChange: (query: string) => void;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
}) {
  const visibleConversations = conversations.filter((conversation) =>
    `${conversation.title} ${conversation.preview}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")),
  );

  return (
    <aside aria-label="Conversas do Tutor IA" className="rounded-xl border bg-card p-3 lg:min-h-[640px]">
      <Button type="button" className="h-10 w-full" onClick={onNewConversation}>
        <MessageSquarePlus className="size-4" aria-hidden="true" />
        Nova conversa
      </Button>
      <label className="relative mt-4 block">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input aria-label="Pesquisar conversa" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Pesquisar conversa" className="h-10 pl-9" />
      </label>
      <div className="mt-5">
        <p className="mb-2 px-2 text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">CONVERSAS</p>
        <ul className="space-y-1" aria-label="Histórico de conversas">
          {visibleConversations.map((conversation) => {
            const isActive = conversation.id === activeConversationId;
            return (
              <li key={conversation.id}>
                <button type="button" onClick={() => onSelectConversation(conversation.id)} aria-current={isActive ? "page" : undefined} className={`w-full rounded-lg px-3 py-2.5 text-left transition-colors ${isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"}`}>
                  <span className="block truncate text-sm font-medium">{conversation.title}</span>
                  <span className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground"><span className="truncate">{conversation.preview}</span><time className="shrink-0">{conversation.updatedAt}</time></span>
                </button>
              </li>
            );
          })}
        </ul>
        {visibleConversations.length === 0 && <p className="px-2 py-6 text-center text-sm text-muted-foreground">Nenhuma conversa encontrada.</p>}
      </div>
    </aside>
  );
}
