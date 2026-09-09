import type { TutorConversation, TutorMessage } from "@/types/tutor";
import { createTutorId } from "../utils/message-utils";

const FAKE_RESPONSE = "Resposta simulada do Tutor IA.";

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
    content: string,
    now = new Date().toISOString(),
  ) {
    const userMessage: TutorMessage = {
      id: createTutorId("user"),
      role: "user",
      content,
    };
    const assistantMessage: TutorMessage = {
      id: createTutorId("assistant"),
      role: "assistant",
      content: FAKE_RESPONSE,
    };

    return conversations.map((conversation) =>
      conversation.id === conversationId
        ? {
            ...conversation,
            messages: [...conversation.messages, userMessage, assistantMessage],
            updatedAt: now,
          }
        : conversation,
    );
  },
};
