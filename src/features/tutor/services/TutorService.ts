import type { TutorConversation, TutorMessage } from "@/types/tutor";
import { createTutorId, getMessageText } from "../utils/message-utils";

type TutorApiResponse = {
  model?: string;
  text?: string;
  error?: string;
};

export class TutorRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TutorRequestError";
  }
}

export const TutorService = {
  createConversation(title = "Nova conversa", now = new Date().toISOString()): TutorConversation {
    return {
      id: createTutorId("conversation"),
      title,
      messages: [
        {
          id: createTutorId("assistant"),
          role: "assistant",
          content: "Nova conversa iniciada. Como posso ajudar no seu estudo?",
        },
      ],
      createdAt: now,
      updatedAt: now,
    };
  },

  renameConversation(
    conversations: readonly TutorConversation[],
    conversationId: string,
    title: string,
    now = new Date().toISOString(),
  ) {
    return conversations.map((conversation) =>
      conversation.id === conversationId
        ? { ...conversation, title, updatedAt: now }
        : conversation,
    );
  },

  deleteConversation(conversations: readonly TutorConversation[], conversationId: string) {
    return conversations.filter((conversation) => conversation.id !== conversationId);
  },

  addMessage(
    conversations: readonly TutorConversation[],
    conversationId: string,
    message: TutorMessage,
    now = new Date().toISOString(),
  ) {
    return conversations.map((conversation) =>
      conversation.id === conversationId
        ? {
            ...conversation,
            messages: [...conversation.messages, message],
            updatedAt: now,
          }
        : conversation,
    );
  },

  createMessage(role: TutorMessage["role"], content: string): TutorMessage {
    return { id: createTutorId(role), role, content };
  },

  async requestReply(
    history: readonly TutorMessage[],
    message: string,
  ): Promise<{ model: string; text: string }> {
    const response = await fetch("/api/tutor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        history: history.map((historyMessage) => ({
          role: historyMessage.role,
          content: getMessageText(historyMessage),
        })),
        message,
      }),
    });
    const data = await response.json().catch(() => null) as TutorApiResponse | null;
    if (!response.ok || !data?.text) {
      throw new TutorRequestError(data?.error ?? "Não foi possível obter uma resposta do Tutor IA.");
    }
    return { model: data.model ?? "Gemini", text: data.text };
  },
};
