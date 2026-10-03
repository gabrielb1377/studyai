import { AISettings } from "./AISettings";

type AIErrorResponse = {
  error?: string;
  code?: string;
  provider?: string;
  suggestion?: string;
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
  ) {
    super(message, options);
    this.name = "AIClientError";
    this.retryAfterMs = retryAfterMs;
  }
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          mode: settings.mode,
          provider: settings.provider,
          model: settings.models[settings.provider],
          models: settings.models,
        }),
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
      );
    }
    return data;
  },

  async stream<T extends { text?: string }>(
    endpoint: string,
    payload: Record<string, unknown>,
    options: { onDelta: (text: string) => void; signal?: AbortSignal; fallbackMessage: string },
  ) {
    const settings = AISettings.load();
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        stream: true,
        mode: settings.mode,
        provider: settings.provider,
        model: settings.models[settings.provider],
        models: settings.models,
      }),
      signal: options.signal,
    });
    if (!response.ok || !response.body) {
      const data = await response.json().catch(() => null) as AIErrorResponse | null;
      throw new Error(data?.error ?? options.fallbackMessage);
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
        const event = JSON.parse(line) as { type: "delta" | "done" | "error"; text?: string; response?: T; error?: string };
        if (event.type === "delta" && event.text) options.onDelta(event.text);
        if (event.type === "done" && event.response) completed = event.response;
        if (event.type === "error") throw new Error(event.error ?? options.fallbackMessage);
      }
    }
    if (buffer.trim()) {
      const event = JSON.parse(buffer) as { type: "done" | "error"; response?: T; error?: string };
      if (event.type === "done" && event.response) completed = event.response;
      if (event.type === "error") throw new Error(event.error ?? options.fallbackMessage);
    }
    if (!completed) throw new Error(options.fallbackMessage);
    return completed;
  },
};
