import "server-only";

import { AIError } from "../AIErrors";
import type { AIProvider, AIResponse } from "../AIProvider";

const API_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL = "gemini-3.7-flash";
const REQUEST_TIMEOUT_MS = 20_000;

type GeminiContent = { role: "model" | "user"; parts: Array<{ text: string }> };
type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string };
};

function toGeminiContent(history: Parameters<AIProvider["generate"]>[0]["history"]): GeminiContent[] {
  return history
    .map((message) => ({
      role: message.role === "assistant" ? "model" as const : "user" as const,
      parts: [{ text: message.content.trim() }],
    }))
    .filter((message) => message.parts[0].text.length > 0);
}

export const GeminiProvider: AIProvider = {
  id: "gemini",
  name: "Gemini",
  available: true,

  async generate({ history, message, signal }): Promise<AIResponse> {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      throw new AIError(
        "Configure GEMINI_API_KEY em .env.local para utilizar o Tutor IA.",
        "MISSING_API_KEY",
        503,
        this.id,
      );
    }

    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);
    const requestSignal = signal
      ? AbortSignal.any([signal, timeoutController.signal])
      : timeoutController.signal;

    try {
      const response = await fetch(`${API_URL}/${MODEL}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
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
        throw new AIError(
          data?.error?.message ?? "O provedor de IA não conseguiu responder agora.",
          "PROVIDER_ERROR",
          response.status >= 400 && response.status < 600 ? response.status : 502,
          this.id,
        );
      }
      const text = data?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text?.trim() ?? "")
        .filter(Boolean)
        .join("\n\n");
      if (!text) {
        throw new AIError("O provedor retornou uma resposta vazia.", "INVALID_RESPONSE", 502, this.id);
      }
      return { provider: this.id, model: MODEL, text };
    } catch (error) {
      if (error instanceof AIError) throw error;
      if (requestSignal.aborted) {
        throw new AIError("A IA demorou demais para responder. Tente novamente.", "TIMEOUT", 504, this.id);
      }
      throw new AIError(
        "Não foi possível conectar ao provedor de IA. Verifique sua conexão e tente novamente.",
        "PROVIDER_ERROR",
        502,
        this.id,
      );
    } finally {
      clearTimeout(timeout);
    }
  },
};
