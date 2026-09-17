import "server-only";

import { AIError } from "./AIErrors";
import type {
  AIManagerRequest,
  AIManagerStatus,
  AIProviderLog,
  AIProviderId,
  AIProviderStatistics,
  AIResponse,
} from "./AIProvider";
import { HealthService } from "./HealthService";
import { LatencyService } from "./LatencyService";
import { ProviderRegistry } from "./ProviderRegistry";
import { AIResponseCache } from "./AIResponseCache";
import type { AIStreamEvent } from "./AIProvider";
import { TokenCounter } from "./TokenCounter";

const FALLBACK_ORDER: readonly AIProviderId[] = ["ollama", "gemini", "groq", "openrouter"];
const MAX_LOGS = 200;

const providerRuntime = globalThis as typeof globalThis & {
  __studyAIProviderLogs?: AIProviderLog[];
};
const logs = providerRuntime.__studyAIProviderLogs ?? [];
providerRuntime.__studyAIProviderLogs = logs;

function addLog(log: Omit<AIProviderLog, "id" | "timestamp">) {
  logs.unshift({
    ...log,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  });
  if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
}

async function automaticOrder(signal?: AbortSignal): Promise<AIProviderId[]> {
  const statuses = await HealthService.checkAll({ signal });
  const online = statuses
    .filter((status) => status.available)
    .sort((left, right) => left.latencyMs - right.latencyMs)
    .map((status) => status.provider);
  return [...online, ...FALLBACK_ORDER.filter((provider) => !online.includes(provider))];
}

function statistics(): AIProviderStatistics {
  const successes = logs.filter((log) => log.success);
  const totalTokens = successes.reduce((total, log) => total + (log.tokens ?? 0), 0);
  return {
    messages: successes.length,
    tokens: totalTokens > 0 ? totalTokens : undefined,
    averageResponseTimeMs: successes.length
      ? Math.round(successes.reduce((total, log) => total + log.latencyMs, 0) / successes.length)
      : 0,
    failures: logs.filter((log) => !log.success).length,
    fallbacks: successes.filter((log) => log.fallback).length,
  };
}

export const ProviderManager = {
  async generate(request: AIManagerRequest): Promise<AIResponse> {
    const preferred = request.provider ?? "gemini";
    const candidates: AIProviderId[] = request.mode === "automatic"
      ? await automaticOrder(request.signal)
      : [preferred];
    const attemptedProviders: AIProviderId[] = [];
    let lastError: unknown;

    for (const providerId of candidates) {
      if (request.signal?.aborted) throw lastError ?? new AIError("Operação cancelada.", "TIMEOUT", 499);
      const provider = ProviderRegistry.get(providerId);
      const fallback = attemptedProviders.length > 0;
      attemptedProviders.push(providerId);
      const selectedModel = request.models?.[providerId] ?? (providerId === preferred ? request.model : undefined);
      const cacheKey = AIResponseCache.keyFor(request, providerId, selectedModel);
      const cached = AIResponseCache.get(cacheKey);
      if (cached) {
        return {
          ...cached,
          execution: {
            attemptedProviders,
            fallbackUsed: fallback,
            latencyMs: 0,
            cached: true,
          },
        };
      }
      const measured = await LatencyService.measure(() => provider.generate({
        ...request,
        model: selectedModel,
      }));

      if (!("error" in measured)) {
        const totalTokens = measured.value.usage?.totalTokens ?? TokenCounter.messages(request.history) + TokenCounter.estimate(request.message) + TokenCounter.estimate(measured.value.text);
        addLog({
          provider: providerId,
          model: measured.value.model,
          latencyMs: measured.latencyMs,
          success: true,
          fallback,
          tokens: totalTokens,
        });
        const response: AIResponse = {
          ...measured.value,
          execution: {
            attemptedProviders,
            fallbackUsed: fallback,
            latencyMs: measured.latencyMs,
          },
        };
        AIResponseCache.set(cacheKey, response);
        return response;
      }

      lastError = measured.error;
      addLog({
        provider: providerId,
        model: request.models?.[providerId],
        latencyMs: measured.latencyMs,
        success: false,
        fallback,
        error: measured.error instanceof Error ? measured.error.message : "Falha desconhecida.",
      });
    }

    throw new AIError(
      "Nenhum provider de IA está disponível. Inicie o Ollama ou configure um provider online.",
      "PROVIDER_UNAVAILABLE",
      503,
      preferred,
    );
  },

  async *stream(request: AIManagerRequest): AsyncGenerator<AIStreamEvent> {
    const preferred = request.provider ?? "gemini";
    const candidates: AIProviderId[] = request.mode === "automatic"
      ? await automaticOrder(request.signal)
      : [preferred];
    const attemptedProviders: AIProviderId[] = [];
    let lastError: unknown;

    for (const providerId of candidates) {
      const provider = ProviderRegistry.get(providerId);
      const fallback = attemptedProviders.length > 0;
      attemptedProviders.push(providerId);
      const selectedModel = request.models?.[providerId] ?? (providerId === preferred ? request.model : undefined);
      const cacheKey = AIResponseCache.keyFor(request, providerId, selectedModel);
      const cached = AIResponseCache.get(cacheKey);
      if (cached) {
        for (const line of cached.text.match(/.{1,80}(?:\s|$)/g) ?? [cached.text]) {
          yield { type: "delta", text: line };
        }
        yield {
          type: "done",
          response: {
            ...cached,
            execution: { attemptedProviders, fallbackUsed: fallback, latencyMs: 0, cached: true },
          },
        };
        return;
      }

      const startedAt = performance.now();
      let emitted = false;
      try {
        if (provider.stream) {
          for await (const event of provider.stream({ ...request, model: selectedModel, stream: true })) {
            if (event.type === "delta") {
              emitted = true;
              yield event;
              continue;
            }
            const latencyMs = Math.round(performance.now() - startedAt);
            const response: AIResponse = {
              ...event.response,
              execution: { attemptedProviders, fallbackUsed: fallback, latencyMs },
            };
            AIResponseCache.set(cacheKey, response);
            const tokens = response.usage?.totalTokens ?? TokenCounter.messages(request.history) + TokenCounter.estimate(request.message) + TokenCounter.estimate(response.text);
            addLog({ provider: providerId, model: response.model, latencyMs, success: true, fallback, tokens });
            yield { type: "done", response };
            return;
          }
        } else {
          const response = await provider.generate({ ...request, model: selectedModel, stream: false });
          for (const line of response.text.match(/.{1,80}(?:\s|$)/g) ?? [response.text]) {
            emitted = true;
            yield { type: "delta", text: line };
          }
          const latencyMs = Math.round(performance.now() - startedAt);
          const completed = { ...response, execution: { attemptedProviders, fallbackUsed: fallback, latencyMs } };
          AIResponseCache.set(cacheKey, completed);
          const tokens = response.usage?.totalTokens ?? TokenCounter.messages(request.history) + TokenCounter.estimate(request.message) + TokenCounter.estimate(response.text);
          addLog({ provider: providerId, model: response.model, latencyMs, success: true, fallback, tokens });
          yield { type: "done", response: completed };
          return;
        }
      } catch (error) {
        lastError = error;
        const latencyMs = Math.round(performance.now() - startedAt);
        addLog({ provider: providerId, model: selectedModel, latencyMs, success: false, fallback, error: error instanceof Error ? error.message : "Falha desconhecida." });
        if (emitted || request.mode !== "automatic") throw error;
      }
    }

    throw lastError ?? new AIError("Nenhum provider de IA está disponível.", "PROVIDER_UNAVAILABLE", 503, preferred);
  },

  inspect(providerId: AIProviderId, options?: { force?: boolean; signal?: AbortSignal }) {
    return HealthService.check(providerId, options);
  },

  async status(options?: { force?: boolean; signal?: AbortSignal }): Promise<AIManagerStatus> {
    const statuses = await HealthService.checkAll(options);
    return {
      providers: statuses.map((status) => {
        const providerLogs = logs.filter((log) => log.provider === status.provider);
        const successes = providerLogs.filter((log) => log.success);
        return {
          ...status,
          averageResponseTimeMs: successes.length
            ? Math.round(successes.reduce((total, log) => total + log.latencyMs, 0) / successes.length)
            : status.latencyMs,
          lastError: providerLogs.find((log) => !log.success)?.error ?? status.error,
        };
      }),
      statistics: statistics(),
      logs: logs.slice(0, 30),
    };
  },
};
