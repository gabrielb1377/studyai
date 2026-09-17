import "server-only";

import { AIError } from "../AIErrors";
import type { AIProvider, AIProviderStatus, AIResponse, AIStreamEvent } from "../AIProvider";

const API_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL = "gemini-3.7-flash";
const REQUEST_TIMEOUT_MS = 20_000;
const HEALTH_TIMEOUT_MS = 5_000;
const MAX_ATTEMPTS = 3;

type GeminiContent = { role: "model" | "user"; parts: Array<{ text: string }> };
type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
};

function toGeminiContent(history: Parameters<AIProvider["generate"]>[0]["history"]): GeminiContent[] {
  return history
    .map((message) => ({
      role: message.role === "assistant" ? "model" as const : "user" as const,
      parts: [{ text: message.content.trim() }],
    }))
    .filter((message) => message.parts[0].text.length > 0);
}

function delay(duration: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, duration);
    signal?.addEventListener("abort", () => {
      clearTimeout(timeout);
      reject(signal.reason);
    }, { once: true });
  });
}

function isHighDemand(status: number, message?: string) {
  return status === 429 || status === 503 || /overload|high demand|resource exhausted/i.test(message ?? "");
}

async function fetchWithBackoff(url: string, init: RequestInit, signal: AbortSignal) {
  let lastResponse: Response | undefined;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch(url, { ...init, signal });
    lastResponse = response;
    if (response.ok) return response;
    const clone = response.clone();
    const data = await clone.json().catch(() => null) as GeminiResponse | null;
    if (!isHighDemand(response.status, data?.error?.message) || attempt === MAX_ATTEMPTS - 1) return response;
    await delay(400 * (2 ** attempt), signal);
  }
  return lastResponse!;
}

function selectedModel(model?: string) {
  return model?.trim().replace(/^models\//, "") || MODEL;
}

export const GeminiProvider: AIProvider = {
  id: "gemini",
  name: "Gemini",
  available: true,

  async inspect(signal): Promise<AIProviderStatus> {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return {
        provider: this.id,
        available: false,
        latencyMs: 0,
        models: [{ name: MODEL }],
        endpoint: API_URL,
        error: "GEMINI_API_KEY não configurada.",
      };
    }

    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort(), HEALTH_TIMEOUT_MS);
    const requestSignal = signal
      ? AbortSignal.any([signal, timeoutController.signal])
      : timeoutController.signal;
    const startedAt = performance.now();
    try {
      const response = await fetch(API_URL, {
        headers: { "x-goog-api-key": apiKey },
        cache: "no-store",
        signal: requestSignal,
      });
      return {
        provider: this.id,
        available: response.ok,
        latencyMs: Math.round(performance.now() - startedAt),
        models: [{ name: MODEL }],
        endpoint: API_URL,
        error: response.ok ? undefined : "Gemini indisponível.",
      };
    } catch {
      return {
        provider: this.id,
        available: false,
        latencyMs: Math.round(performance.now() - startedAt),
        models: [{ name: MODEL }],
        endpoint: API_URL,
        error: "Gemini indisponível.",
      };
    } finally {
      clearTimeout(timeout);
    }
  },

  async generate({ history, message, model, signal }): Promise<AIResponse> {
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
      const activeModel = selectedModel(model);
      const response = await fetchWithBackoff(`${API_URL}/${activeModel}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [
            ...toGeminiContent(history),
            { role: "user", parts: [{ text: message.trim() }] },
          ],
        }),
        cache: "no-store",
      }, requestSignal);
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
      return {
        provider: this.id,
        model: activeModel,
        text,
        usage: {
          inputTokens: data?.usageMetadata?.promptTokenCount,
          outputTokens: data?.usageMetadata?.candidatesTokenCount,
          totalTokens: data?.usageMetadata?.totalTokenCount,
        },
      };
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

  async *stream({ history, message, model, signal }): AsyncGenerator<AIStreamEvent> {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) throw new AIError("Configure GEMINI_API_KEY em .env.local para utilizar o Tutor IA.", "MISSING_API_KEY", 503, this.id);
    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);
    const requestSignal = signal ? AbortSignal.any([signal, timeoutController.signal]) : timeoutController.signal;
    const activeModel = selectedModel(model);
    let text = "";
    let usage: AIResponse["usage"];

    try {
      const response = await fetchWithBackoff(`${API_URL}/${activeModel}:streamGenerateContent?alt=sse`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({ contents: [...toGeminiContent(history), { role: "user", parts: [{ text: message.trim() }] }] }),
        cache: "no-store",
      }, requestSignal);
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => null) as GeminiResponse | null;
        throw new AIError(data?.error?.message ?? "O Gemini não conseguiu iniciar o streaming.", "PROVIDER_ERROR", response.status || 502, this.id);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const event of events) {
          const payload = event.split("\n").find((line) => line.startsWith("data:"))?.slice(5).trim();
          if (!payload) continue;
          const data = JSON.parse(payload) as GeminiResponse;
          const delta = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
          if (delta) {
            text += delta;
            yield { type: "delta", text: delta };
          }
          usage = {
            inputTokens: data.usageMetadata?.promptTokenCount ?? usage?.inputTokens,
            outputTokens: data.usageMetadata?.candidatesTokenCount ?? usage?.outputTokens,
            totalTokens: data.usageMetadata?.totalTokenCount ?? usage?.totalTokens,
          };
        }
      }
      if (!text.trim()) throw new AIError("O Gemini retornou uma resposta vazia.", "INVALID_RESPONSE", 502, this.id);
      yield { type: "done", response: { provider: this.id, model: activeModel, text: text.trim(), usage } };
    } catch (error) {
      if (error instanceof AIError) throw error;
      if (requestSignal.aborted) throw new AIError("A IA demorou demais para responder. Tente novamente.", "TIMEOUT", 504, this.id);
      throw new AIError("Não foi possível conectar ao Gemini.", "PROVIDER_ERROR", 502, this.id);
    } finally {
      clearTimeout(timeout);
    }
  },
};
