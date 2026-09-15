import type { TutorConversation, TutorMessage } from "@/types/tutor";
import type { TutorStudyContext } from "@/types/tutor-context";
import type { RetrievedChunk } from "@/features/retrieval/RetrievalTypes";
import { AIClient } from "@/features/ai/AIClient";
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
      messages: [],
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
    context?: TutorStudyContext | null,
    chunks: readonly RetrievedChunk[] = [],
  ): Promise<{ model: string; text: string }> {
    const data = await AIClient.request<TutorApiResponse>(
      "/api/tutor",
      {
        history: history.map((historyMessage) => ({
          role: historyMessage.role,
          content: getMessageText(historyMessage),
        })),
        message,
        context: context ?? undefined,
        chunks: chunks.length > 0 ? chunks : undefined,
      },
      "Não foi possível obter uma resposta do Tutor IA.",
    );
    if (!data.text) throw new TutorRequestError("O provider retornou uma resposta vazia.");
    return { model: data.model ?? "IA", text: data.text };
  },

  async requestSummary(
    history: readonly TutorMessage[],
    context: TutorStudyContext,
    chunks: readonly RetrievedChunk[],
  ): Promise<{ model: string; text: string }> {
    const data = await AIClient.request<TutorApiResponse>(
      "/api/tutor/summary",
      {
        history: history.map((historyMessage) => ({
          role: historyMessage.role,
          content: getMessageText(historyMessage),
        })),
        context,
        chunks,
      },
      "Não foi possível gerar o resumo agora.",
    );
    if (!data.text) throw new TutorRequestError("O provider retornou um resumo vazio.");
    return { model: data.model ?? "IA", text: data.text };
  },
};
