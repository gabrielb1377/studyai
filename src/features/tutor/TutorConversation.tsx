import { TutorMessage } from "./TutorMessage";
import type { TutorMessage as TutorMessageType } from "@/types/tutor";

export function TutorConversation({ messages }: { messages: readonly TutorMessageType[] }) {
  return (
    <section aria-label="Conversa com o Tutor IA" className="min-h-[420px] space-y-5 rounded-xl border bg-card p-4 sm:min-h-[520px] sm:p-6">
      {messages.map((message) => <TutorMessage key={message.id} message={message} />)}
    </section>
  );
}
