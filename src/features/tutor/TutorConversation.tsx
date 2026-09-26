"use client";

import { useEffect, useRef } from "react";
import { TutorMessage } from "./TutorMessage";
import type { TutorMessage as TutorMessageType } from "@/types/tutor";

export function TutorConversation({ messages, isLoading, assistantLabel = "Tutor", onResponseAction }: { messages: readonly TutorMessageType[]; isLoading: boolean; assistantLabel?: "Tutor" | "Professor"; onResponseAction?: (action: "continue" | "regenerate" | "explain", response: string) => void }) {
  const endRef = useRef<HTMLDivElement>(null);
  const lastContent = messages.at(-1)?.content;
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [isLoading, lastContent, messages.length]);

  return (
    <section aria-label="Conversa com o Tutor IA" className="premium-scroll min-h-0 flex-1 space-y-6 overflow-y-auto rounded-2xl border bg-background/55 p-4 sm:p-6">
      {messages.length === 0 && !isLoading && (
        <div className="flex min-h-[360px] items-center justify-center text-center sm:min-h-[460px]">
          <div>
            <p className="font-medium">Conversa vazia</p>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">Envie uma pergunta. Quando houver um estudo aberto, o {assistantLabel} usará apenas o contexto real recuperado.</p>
          </div>
        </div>
      )}
      {messages.map((message) => <TutorMessage key={message.id} message={message} onResponseAction={onResponseAction} />)}
      {isLoading && (
        <div className="flex items-center gap-2 rounded-xl bg-secondary/50 px-4 py-3 text-sm text-muted-foreground" role="status" aria-live="polite">
          <span className="size-2 animate-pulse rounded-full bg-primary" />
          <span className="size-2 animate-pulse rounded-full bg-primary [animation-delay:150ms]" />
          <span className="size-2 animate-pulse rounded-full bg-primary [animation-delay:300ms]" />
          O {assistantLabel} está preparando a resposta...
        </div>
      )}
      <div ref={endRef} aria-hidden="true" />
    </section>
  );
}
