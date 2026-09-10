import type { TutorMessage } from "@/types/tutor";

export function createTutorId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getConversationPreview(messages: readonly TutorMessage[]) {
  const latestMessage = messages.at(-1);
  return latestMessage?.content ?? "Sem mensagens";
}

export function getMessageText(message: TutorMessage) {
  const list = message.list?.map((item) => `- ${item}`).join("\n");
  const code = message.code
    ? `\`\`\`${message.code.language}\n${message.code.code}\n\`\`\``
    : undefined;
  const table = message.table
    ? [message.table.headers, ...message.table.rows].map((row) => row.join(" | ")).join("\n")
    : undefined;

  return [message.heading, message.content, list, code, table].filter(Boolean).join("\n\n");
}

export function formatConversationUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Agora";

  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  if (sameDay) return "Hoje";

  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" })
    .format(date)
    .replace(".", "");
}
