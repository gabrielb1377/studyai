import { TutorMessage } from "./TutorMessage";
import type { TutorMessage as TutorMessageType } from "@/types/tutor";

export function TutorConversation({ messages, isLoading }: { messages: readonly TutorMessageType[]; isLoading: boolean }) {
  return (
    <section aria-label="Conversa com o Tutor IA" className="min-h-[420px] space-y-5 rounded-xl border bg-card p-4 sm:min-h-[520px] sm:p-6">
      {messages.map((message) => <TutorMessage key={message.id} message={message} />)}
      {isLoading && (
        <div className="flex gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">
          <span className="size-2 animate-pulse rounded-full bg-primary" />
          Gemini está preparando a resposta...
        </div>
      )}
    </section>
  );
}
