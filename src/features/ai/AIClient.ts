import { AISettings } from "./AISettings";
import type { AIFallbackOffer } from "./AIProvider";

type AIErrorResponse = {
  error?: string;
  code?: string;
  provider?: string;
  suggestion?: string;
  fallback?: AIFallbackOffer;
};

export class AIClientError extends Error {
  public readonly retryAfterMs?: number;

  constructor(
    message: string,
    public readonly code = "UNKNOWN_ERROR",
    public readonly provider?: string,
    public readonly suggestion?: string,
    public readonly status?: number,
    options?: ErrorOptions,
    retryAfterMs?: number,
    public readonly fallback?: AIFallbackOffer,
  ) {
    super(message, options);
    this.name = "AIClientError";
    this.retryAfterMs = retryAfterMs;
  }
}

function configuredPayload(payload: Record<string, unknown>) {
  const settings = AISettings.load();
  const provider = typeof payload.provider === "string" ? payload.provider : settings.provider;
  return {
    ...payload,
    mode: payload.mode ?? settings.mode,
    provider,
    model: payload.model ?? settings.models[provider as keyof typeof settings.models],
    models: payload.models ?? settings.models,
  };
}

function csrfToken() {
  if (typeof document === "undefined") return "";
  return document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith("studyai_csrf="))
    ?.split("=")
    .slice(1)
    .join("=") ?? "";
}

function clientError(data: AIErrorResponse | null, fallbackMessage: string, status?: number, retryAfter?: number) {
  return new AIClientError(
    data?.error ?? fallbackMessage,
    data?.code ?? (status ? "HTTP_ERROR" : "INVALID_RESPONSE"),
    data?.provider,
    data?.suggestion,
    status,
    undefined,
    retryAfter,
    data?.fallback,
  );
}

function retryAfterMs(value: string | null) {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

export const AIClient = {
  async request<T>(
    endpoint: string,
    payload: Record<string, unknown>,
    fallbackMessage: string,
    options: { signal?: AbortSignal } = {},
  ) {
    const settings = AISettings.load();
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken() },
        body: JSON.stringify(configuredPayload(payload)),
        signal: options.signal,
      });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      throw new AIClientError(
        "Não foi possível conectar ao serviço de IA.",
        "NETWORK_ERROR",
        settings.provider,
        "Verifique a conexão e o status do provider em Configurações > IA.",
        undefined,
        { cause: error },
      );
    }
    const data = await response.json().catch(() => null) as (T & AIErrorResponse) | null;
    if (!response.ok || !data) {
      throw new AIClientError(
        data?.error ?? fallbackMessage,
        data?.code ?? (response.ok ? "INVALID_RESPONSE" : "HTTP_ERROR"),
        data?.provider ?? settings.provider,
        data?.suggestion ?? (response.ok ? "Tente novamente ou selecione outro modelo." : undefined),
        response.status,
        undefined,
        retryAfterMs(response.headers.get("retry-after")),
        data?.fallback,
      );
    }
    return data;
  },

  async stream<T extends { text?: string }>(
    endpoint: string,
    payload: Record<string, unknown>,
    options: { onDelta: (text: string) => void; signal?: AbortSignal; fallbackMessage: string },
  ) {
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken() },
        body: JSON.stringify(configuredPayload({ ...payload, stream: true })),
        signal: options.signal,
      });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      throw new AIClientError("Não foi possível conectar ao serviço de IA.", "NETWORK_ERROR", undefined, undefined, undefined, { cause: error });
    }
    if (!response.ok || !response.body) {
      const data = await response.json().catch(() => null) as AIErrorResponse | null;
      throw clientError(data, options.fallbackMessage, response.status, retryAfterMs(response.headers.get("retry-after")));
    }
    if (response.headers.get("content-type")?.includes("application/json")) {
      const data = await response.json().catch(() => null) as T | null;
      if (!data) throw new Error(options.fallbackMessage);
      if (data.text) options.onDelta(data.text);
      return data;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let completed: T | null = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line) as { type: "delta" | "done" | "error"; text?: string; response?: T; error?: string; code?: string; provider?: string; suggestion?: string; fallback?: AIFallbackOffer };
        if (event.type === "delta" && event.text) options.onDelta(event.text);
        if (event.type === "done" && event.response) completed = event.response;
        if (event.type === "error") throw clientError(event, options.fallbackMessage);
      }
    }
    if (buffer.trim()) {
      const event = JSON.parse(buffer) as { type: "done" | "error"; response?: T; error?: string; code?: string; provider?: string; suggestion?: string; fallback?: AIFallbackOffer };
      if (event.type === "done" && event.response) completed = event.response;
      if (event.type === "error") throw clientError(event, options.fallbackMessage);
    }
    if (!completed) throw new Error(options.fallbackMessage);
    return completed;
  },
};
