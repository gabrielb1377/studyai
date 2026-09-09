"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StudyMessage } from "@/types/study";

const quickActions = ["Explicar", "Resumir", "Flashcards", "Exercícios"];

export function AiTab({ messages: initialMessages }: { messages: readonly StudyMessage[] }) {
  const [messages, setMessages] = useState<StudyMessage[]>([...initialMessages]);
  const [draft, setDraft] = useState("");

  const sendMessage = () => {
    const content = draft.trim();
    if (!content) return;
    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: "user", content },
      {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: "Resposta simulada: a integração com IA será adicionada em uma próxima etapa.",
      },
    ]);
    setDraft("");
  };

  return (
    <section aria-labelledby="ai-title" className="mx-auto max-w-3xl space-y-5">
      <div>
        <h2 id="ai-title" className="text-lg font-semibold tracking-tight">Tutor de estudo</h2>
        <p className="mt-1 text-sm text-muted-foreground">Conversa demonstrativa, sem conexão com IA.</p>
      </div>
      <div className="space-y-3 rounded-xl border bg-card p-4 sm:p-5" aria-label="Mensagens do tutor">
        {messages.map((message) => (
          <div key={message.id} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <p className={message.role === "user" ? "max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm leading-6 text-primary-foreground" : "max-w-[85%] rounded-2xl rounded-bl-md bg-secondary px-4 py-3 text-sm leading-6 text-secondary-foreground"}>
              {message.content}
            </p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Ações rápidas do tutor">
        {quickActions.map((action) => (
          <Button key={action} type="button" variant="outline" size="sm" onClick={() => setDraft(`${action} ${"Vetores e matrizes".toLowerCase()}`)}>
            {action}
          </Button>
        ))}
      </div>
      <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); sendMessage(); }}>
        <input
          aria-label="Mensagem para o tutor"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Escreva sua dúvida..."
          className="h-11 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
        />
        <Button type="submit" className="h-11" disabled={!draft.trim()}>
          <Send className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Enviar</span>
          <span className="sr-only sm:hidden">Enviar</span>
        </Button>
      </form>
    </section>
  );
}
