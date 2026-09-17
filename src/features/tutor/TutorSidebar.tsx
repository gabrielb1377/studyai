"use client";

import { MessageSquarePlus, MoreHorizontal, Pencil, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { TutorConversation } from "@/types/tutor";
import { formatConversationUpdatedAt, getConversationPreview } from "./utils/message-utils";

export function TutorSidebar({
  conversations,
  activeConversationId,
  query,
  onQueryChange,
  onSelectConversation,
  onNewConversation,
  onRenameConversation,
  onDeleteConversation,
}: {
  conversations: readonly TutorConversation[];
  activeConversationId: string;
  query: string;
  onQueryChange: (query: string) => void;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onRenameConversation: (conversation: TutorConversation) => void;
  onDeleteConversation: (conversationId: string) => void;
}) {
  const visibleConversations = conversations.filter((conversation) =>
    `${conversation.title} ${getConversationPreview(conversation.messages)}`
      .toLocaleLowerCase("pt-BR")
      .includes(query.toLocaleLowerCase("pt-BR")),
  );

  return (
    <aside aria-label="Conversas do Tutor IA" className="min-w-0 overflow-y-auto rounded-xl border bg-card p-3 max-lg:max-h-44 lg:min-h-0">
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
              <li key={conversation.id} className={`group flex min-w-0 items-center rounded-lg transition-colors ${isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"}`}>
                <button type="button" onClick={() => onSelectConversation(conversation.id)} aria-current={isActive ? "page" : undefined} className="min-w-0 flex-1 px-3 py-2.5 text-left">
                  <span className="block truncate text-sm font-medium">{conversation.title}</span>
                  <span className="mt-1 flex min-w-0 items-center justify-between gap-2 text-xs text-muted-foreground"><span className="min-w-0 truncate">{getConversationPreview(conversation.messages)}</span><time className="shrink-0">{formatConversationUpdatedAt(conversation.updatedAt)}</time></span>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="icon-xs" className="mr-2 opacity-100 lg:opacity-0 lg:group-hover:opacity-100" aria-label={`Ações para ${conversation.title}`}><MoreHorizontal aria-hidden="true" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => onRenameConversation(conversation)}><Pencil aria-hidden="true" />Renomear</DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onSelect={() => onDeleteConversation(conversation.id)}><Trash2 aria-hidden="true" />Excluir</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
        {visibleConversations.length === 0 && <p className="px-2 py-6 text-center text-sm text-muted-foreground">Nenhuma conversa encontrada.</p>}
      </div>
    </aside>
  );
}
