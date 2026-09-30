import "server-only";

import { AIError } from "../AIErrors";
import type { AIProvider, AIProviderStatus, AIResponse, AIStreamEvent } from "../AIProvider";

const API_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const FALLBACK_MODEL = "gemini-2.5-flash";
const REQUEST_TIMEOUT_MS = 20_000;
const HEALTH_TIMEOUT_MS = 5_000;
const MAX_ATTEMPTS = 3;
let lastWorkingModel: string | undefined;

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

type GeminiModelsResponse = {
  models?: Array<{
    name?: string;
    displayName?: string;
    inputTokenLimit?: number;
    outputTokenLimit?: number;
    supportedGenerationMethods?: string[];
  }>;
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

async function fetchWithBackoff(url: string, init: RequestInit, signal: AbortSignal, maxAttempts = MAX_ATTEMPTS) {
  let lastResponse: Response | undefined;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await fetch(url, { ...init, signal });
    lastResponse = response;
    if (response.ok) return response;
    const clone = response.clone();
    const data = await clone.json().catch(() => null) as GeminiResponse | null;
    if (!isHighDemand(response.status, data?.error?.message) || attempt === maxAttempts - 1) return response;
    await delay(400 * (2 ** attempt), signal);
  }
  return lastResponse!;
}

async function listModels(apiKey: string, signal?: AbortSignal) {
  const response = await fetch(API_URL, {
    headers: { "x-goog-api-key": apiKey },
    cache: "no-store",
    signal,
  });
  const data = await response.json().catch(() => null) as GeminiModelsResponse | null;
  if (!response.ok) throw new AIError("Não foi possível listar os modelos do Gemini.", "PROVIDER_UNAVAILABLE", response.status, "gemini");
  return (data?.models ?? []).flatMap((model) => {
    const name = model.name?.trim().replace(/^models\//, "");
    if (!name || !model.supportedGenerationMethods?.includes("generateContent")) return [];
    return [{ name, contextWindow: model.inputTokenLimit, outputTokenLimit: model.outputTokenLimit }];
  });
}

async function modelCandidates(apiKey: string, model: string | undefined, signal: AbortSignal) {
  if (model?.trim()) return [{ name: model.trim().replace(/^models\//, ""), outputTokenLimit: undefined }];
  const models = await listModels(apiKey, signal);
  const stableFlash = models
    .filter((candidate) => /^gemini-[\d.]+-flash$/.test(candidate.name))
    .sort((left, right) => right.name.localeCompare(left.name, undefined, { numeric: true }));
  const alias = models.find((candidate) => candidate.name === "gemini-flash-latest");
  const otherFlash = models.filter((candidate) => /flash/i.test(candidate.name) && !stableFlash.includes(candidate) && candidate !== alias);
  const candidates = [...stableFlash, ...(alias ? [alias] : []), ...otherFlash, ...models.filter((candidate) => !/flash/i.test(candidate.name))];
  if (!lastWorkingModel) return candidates;
  return candidates.sort((left, right) => Number(right.name === lastWorkingModel) - Number(left.name === lastWorkingModel));
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
        models: [{ name: FALLBACK_MODEL }],
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
      const models = await listModels(apiKey, requestSignal);
      return {
        provider: this.id,
        available: models.length > 0,
        latencyMs: Math.round(performance.now() - startedAt),
        models,
        endpoint: API_URL,
        error: models.length > 0 ? undefined : "Nenhum modelo compatível encontrado no Gemini.",
      };
    } catch {
      return {
        provider: this.id,
        available: false,
        latencyMs: Math.round(performance.now() - startedAt),
        models: [],
        endpoint: API_URL,
        error: "Gemini indisponível.",
      };
    } finally {
      clearTimeout(timeout);
    }
  },

  async generate({ history, message, model, signal, maxOutputTokens, timeoutMs }): Promise<AIResponse> {
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
    const timeout = setTimeout(() => timeoutController.abort(), timeoutMs ?? REQUEST_TIMEOUT_MS);
    const requestSignal = signal
      ? AbortSignal.any([signal, timeoutController.signal])
      : timeoutController.signal;

    try {
      const candidates = await modelCandidates(apiKey, model, requestSignal);
      if (candidates.length === 0) throw new AIError("Nenhum modelo compatível encontrado no Gemini.", "PROVIDER_UNAVAILABLE", 503, this.id);
      let activeModel = candidates[0];
      let response: Response | undefined;
      let data: GeminiResponse | null = null;
      for (const candidate of candidates.slice(0, model?.trim() ? 1 : 4)) {
        activeModel = candidate;
        const outputLimit = Math.min(maxOutputTokens ?? candidate.outputTokenLimit ?? 8_192, candidate.outputTokenLimit ?? Number.MAX_SAFE_INTEGER);
        response = await fetchWithBackoff(`${API_URL}/${candidate.name}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            contents: [
              ...toGeminiContent(history),
              { role: "user", parts: [{ text: message.trim() }] },
            ],
            generationConfig: { maxOutputTokens: outputLimit },
          }),
          cache: "no-store",
        }, requestSignal, model?.trim() ? MAX_ATTEMPTS : 1);
        data = await response.json().catch(() => null) as GeminiResponse | null;
        if (response.ok) {
          lastWorkingModel = candidate.name;
          break;
        }
        if (!isHighDemand(response.status, data?.error?.message)) break;
      }
      if (!response) throw new AIError("Nenhum modelo compatível encontrado no Gemini.", "PROVIDER_UNAVAILABLE", 503, this.id);
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
        model: activeModel.name,
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

  async *stream({ history, message, model, signal, maxOutputTokens, timeoutMs }): AsyncGenerator<AIStreamEvent> {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) throw new AIError("Configure GEMINI_API_KEY em .env.local para utilizar o Tutor IA.", "MISSING_API_KEY", 503, this.id);
    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort(), timeoutMs ?? REQUEST_TIMEOUT_MS);
    const requestSignal = signal ? AbortSignal.any([signal, timeoutController.signal]) : timeoutController.signal;
    let text = "";
    let usage: AIResponse["usage"];

    try {
      const [activeModel] = await modelCandidates(apiKey, model, requestSignal);
      if (!activeModel) throw new AIError("Nenhum modelo compatível encontrado no Gemini.", "PROVIDER_UNAVAILABLE", 503, this.id);
      const outputLimit = Math.min(maxOutputTokens ?? activeModel.outputTokenLimit ?? 8_192, activeModel.outputTokenLimit ?? Number.MAX_SAFE_INTEGER);
      const response = await fetchWithBackoff(`${API_URL}/${activeModel.name}:streamGenerateContent?alt=sse`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [...toGeminiContent(history), { role: "user", parts: [{ text: message.trim() }] }],
          generationConfig: { maxOutputTokens: outputLimit },
        }),
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
      yield { type: "done", response: { provider: this.id, model: activeModel.name, text: text.trim(), usage } };
    } catch (error) {
      if (error instanceof AIError) throw error;
      if (requestSignal.aborted) throw new AIError("A IA demorou demais para responder. Tente novamente.", "TIMEOUT", 504, this.id);
      throw new AIError("Não foi possível conectar ao Gemini.", "PROVIDER_ERROR", 502, this.id);
    } finally {
      clearTimeout(timeout);
    }
  },
};
