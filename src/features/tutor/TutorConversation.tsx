import { TutorMessage } from "./TutorMessage";
import type { TutorMessage as TutorMessageType } from "@/types/tutor";

export function TutorConversation({ messages, isLoading }: { messages: readonly TutorMessageType[]; isLoading: boolean }) {
  return (
    <section aria-label="Conversa com o Tutor IA" className="min-h-[420px] space-y-5 rounded-xl border bg-card p-4 sm:min-h-[520px] sm:p-6">
      {messages.length === 0 && !isLoading && (
        <div className="flex min-h-[360px] items-center justify-center text-center sm:min-h-[460px]">
          <div>
            <p className="font-medium">Conversa vazia</p>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">Envie uma pergunta. Quando houver um estudo aberto, o Tutor usará apenas o contexto real recuperado.</p>
          </div>
        </div>
      )}
      {messages.map((message) => <TutorMessage key={message.id} message={message} />)}
      {isLoading && (
        <div className="flex gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">
          <span className="size-2 animate-pulse rounded-full bg-primary" />
          O Tutor está preparando a resposta...
        </div>
      )}
    </section>
  );
}
