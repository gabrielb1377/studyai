import "server-only";

import type { TutorMessage } from "@/types/tutor";

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_MODEL = "gemini-3.7-flash";
const REQUEST_TIMEOUT_MS = 20_000;

type GeminiContent = {
  role: "model" | "user";
  parts: Array<{ text: string }>;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

export type GeminiErrorCode =
  | "INVALID_RESPONSE"
  | "MISSING_API_KEY"
  | "PROVIDER_ERROR"
  | "TIMEOUT";

export class GeminiServiceError extends Error {
  constructor(
    message: string,
    public readonly code: GeminiErrorCode,
    public readonly status: number,
  ) {
    super(message);
    this.name = "GeminiServiceError";
  }
}

function toGeminiContent(messages: readonly Pick<TutorMessage, "content" | "role">[]): GeminiContent[] {
  return messages
    .map((message) => ({
      role: message.role === "assistant" ? "model" as const : "user" as const,
      parts: [{ text: message.content.trim() }],
    }))
    .filter((message) => message.parts[0].text.length > 0);
}

export const GeminiService = {
  async generateReply({
    history,
    message,
    signal,
  }: {
    history: readonly Pick<TutorMessage, "content" | "role">[];
    message: string;
    signal?: AbortSignal;
  }) {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      throw new GeminiServiceError(
        "Gemini não configurado. Adicione GEMINI_API_KEY ao arquivo .env.local.",
        "MISSING_API_KEY",
        503,
      );
    }

    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);
    const requestSignal = signal
      ? AbortSignal.any([signal, timeoutController.signal])
      : timeoutController.signal;

    try {
      const response = await fetch(`${GEMINI_API_URL}/${GEMINI_MODEL}:generateContent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            ...toGeminiContent(history),
            { role: "user", parts: [{ text: message.trim() }] },
          ],
        }),
        cache: "no-store",
        signal: requestSignal,
      });

      const data = await response.json().catch(() => null) as GeminiResponse | null;
      if (!response.ok) {
        throw new GeminiServiceError(
          data?.error?.message ?? "O Gemini não conseguiu responder agora.",
          "PROVIDER_ERROR",
          response.status >= 400 && response.status < 600 ? response.status : 502,
        );
      }

      const text = data?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text?.trim() ?? "")
        .filter(Boolean)
        .join("\n\n");

      if (!text) {
        throw new GeminiServiceError(
          "O Gemini retornou uma resposta vazia.",
          "INVALID_RESPONSE",
          502,
        );
      }

      return { model: GEMINI_MODEL, text };
    } catch (error) {
      if (error instanceof GeminiServiceError) throw error;
      if (requestSignal.aborted) {
        throw new GeminiServiceError(
          "O Gemini demorou demais para responder. Tente novamente.",
          "TIMEOUT",
          504,
        );
      }
      throw new GeminiServiceError(
        "Não foi possível conectar ao Gemini. Verifique sua conexão e tente novamente.",
        "PROVIDER_ERROR",
        502,
      );
    } finally {
      clearTimeout(timeout);
    }
  },
};
