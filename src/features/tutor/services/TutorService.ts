import type { TutorConversation, TutorMessage } from "@/types/tutor";
import type { TutorStudyContext } from "@/types/tutor-context";
import type { RetrievedChunk } from "@/features/retrieval/RetrievalTypes";
import { AIClient } from "@/features/ai/AIClient";
import type { TeacherRequest } from "@/features/teacher/types";
import { createTutorId, getMessageText } from "../utils/message-utils";

type TutorApiResponse = {
  provider?: string;
  model?: string;
  text?: string;
  error?: string;
  usage?: TutorMessage["metadata"];
  execution?: { cached?: boolean };
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

  replaceMessage(
    conversations: readonly TutorConversation[],
    conversationId: string,
    messageId: string,
    changes: Partial<TutorMessage>,
    now = new Date().toISOString(),
  ) {
    return conversations.map((conversation) => conversation.id === conversationId
      ? {
          ...conversation,
          messages: conversation.messages.map((message) => message.id === messageId ? { ...message, ...changes } : message),
          updatedAt: now,
        }
      : conversation);
  },

  removeMessage(conversations: readonly TutorConversation[], conversationId: string, messageId: string) {
    return conversations.map((conversation) => conversation.id === conversationId
      ? { ...conversation, messages: conversation.messages.filter((message) => message.id !== messageId), updatedAt: new Date().toISOString() }
      : conversation);
  },

  createMessage(role: TutorMessage["role"], content: string): TutorMessage {
    return { id: createTutorId(role), role, content };
  },

  async requestReply(
    history: readonly TutorMessage[],
    message: string,
    context?: TutorStudyContext | null,
    chunks: readonly RetrievedChunk[] = [],
    options?: { onDelta?: (text: string) => void; signal?: AbortSignal; teaching?: TeacherRequest },
  ): Promise<{ model: string; text: string; provider?: string; metadata?: TutorMessage["metadata"] }> {
    const payload = {
      history: history.map((historyMessage) => ({
        role: historyMessage.role,
        content: getMessageText(historyMessage),
      })),
      message,
      context: context ?? undefined,
      chunks: chunks.length > 0 ? chunks : undefined,
      teaching: options?.teaching,
    };
    const data = options?.onDelta
      ? await AIClient.stream<TutorApiResponse>("/api/tutor", payload, {
          onDelta: options.onDelta,
          signal: options.signal,
          fallbackMessage: "Não foi possível obter uma resposta do Tutor IA.",
        })
      : await AIClient.request<TutorApiResponse>(
      "/api/tutor",
      payload,
      "Não foi possível obter uma resposta do Tutor IA.",
    );
    if (!data.text) throw new TutorRequestError("O provider retornou uma resposta vazia.");
    return {
      model: data.model ?? "IA",
      provider: data.provider,
      text: data.text,
      metadata: {
        ...data.usage,
        provider: data.provider,
        model: data.model,
        cached: data.execution?.cached,
      },
    };
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
