import "server-only";

import { AIFallbackConsentError, AIError, safeAIErrorLogMessage } from "./AIErrors";
import {
  aiProviderIds,
  type AIFallbackAlternative,
  type AIManagerRequest,
  type AIManagerStatus,
  type AIModel,
  type AIProviderLog,
  type AIProviderId,
  type AIProviderStatistics,
  type AIResponse,
} from "./AIProvider";
import { HealthService } from "./HealthService";
import { LatencyService } from "./LatencyService";
import { ProviderRegistry } from "./ProviderRegistry";
import { AIResponseCache } from "./AIResponseCache";
import type { AIStreamEvent } from "./AIProvider";
import { TokenCounter } from "./TokenCounter";

const MAX_LOGS = 200;
const FALLBACK_ATTEMPT_TTL_MS = 5 * 60_000;

// Never repeat rejected authentication, permission or validation requests.
function isRecoverableProviderError(error: unknown) {
  if (!(error instanceof AIError) || error.code === "MISSING_API_KEY" || error.code === "INVALID_RESPONSE") return false;
  return error.status === 429 || (error.status >= 500 && error.status < 600);
}

const fallbackRuntime = globalThis as typeof globalThis & {
  __studyAIFallbackAttempts?: Map<string, { expiresAt: number; promise: Promise<AIResponse> }>;
};
const fallbackAttempts = fallbackRuntime.__studyAIFallbackAttempts ?? new Map();
fallbackRuntime.__studyAIFallbackAttempts = fallbackAttempts;

function fallbackCost(provider: AIProviderId, request: AIManagerRequest): Pick<AIFallbackAlternative, "cost" | "notice"> {
  if (provider === "ollama") {
    return { cost: "local", notice: "Execução local; não usa a cota compartilhada." };
  }
  if (request.apiKeys?.[provider]) {
    return { cost: "byok", notice: "Usa sua chave pessoal; podem existir custos na conta do provedor." };
  }
  return { cost: "shared_quota", notice: "Usa uma tentativa da cota compartilhada do StudyAI." };
}

async function availableFallbacks(request: AIManagerRequest, preferred: AIProviderId) {
  const alternatives = await Promise.all(aiProviderIds
    .filter((provider) => provider !== preferred)
    .map(async (provider): Promise<AIFallbackAlternative | null> => {
      const status = await HealthService.check(provider, {
        force: true,
        signal: request.signal,
        apiKey: request.apiKeys?.[provider],
      });
      if (!status.available || status.models.length === 0) return null;
      const requestedModel = request.models?.[provider];
      const model = requestedModel && status.models.some((item: AIModel) => item.name === requestedModel)
        ? requestedModel
        : status.models[0].name;
      return { provider, model, ...fallbackCost(provider, request) };
    }));
  return alternatives.filter((alternative): alternative is AIFallbackAlternative => alternative !== null);
}

async function requireFallbackConsent(request: AIManagerRequest, preferred: AIProviderId, error: unknown): Promise<never> {
  if (request.fallbackPolicy !== "consent" || !request.requestId || !isRecoverableProviderError(error)) throw error;
  const alternatives = await availableFallbacks(request, preferred);
  if (alternatives.length === 0) throw error;
  throw new AIFallbackConsentError({
    requestId: request.requestId,
    primaryProvider: preferred,
    primaryModel: request.model ?? request.models?.[preferred],
    alternatives,
  });
}

async function authorizedProvider(request: AIManagerRequest, preferred: AIProviderId) {
  const consent = request.fallbackConsent;
  if (!consent) return { provider: preferred, model: request.model ?? request.models?.[preferred], fallback: false };
  if (!request.requestId || consent.requestId !== request.requestId || consent.originalProvider !== preferred || consent.provider === preferred) {
    throw new AIError("A autorização de fallback não corresponde à requisição original.", "PROVIDER_ERROR", 400, preferred);
  }
  const status = await HealthService.check(consent.provider, {
    force: true,
    signal: request.signal,
    apiKey: request.apiKeys?.[consent.provider],
  });
  if (!status.available || !status.models.some((model: AIModel) => model.name === consent.model)) {
    throw new AIError("A alternativa autorizada não está mais disponível.", "PROVIDER_UNAVAILABLE", 503, consent.provider);
  }
  return { provider: consent.provider, model: consent.model, fallback: true };
}

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
    const authorized = await authorizedProvider(request, preferred);
    const attemptedProviders: AIProviderId[] = authorized.fallback ? [preferred, authorized.provider] : [preferred];

    const execute = async (): Promise<AIResponse> => {
      if (request.signal?.aborted) throw new AIError("Operação cancelada.", "TIMEOUT", 499, authorized.provider);
      const providerId = authorized.provider;
      const provider = ProviderRegistry.get(providerId);
      const selectedModel = authorized.model;
      const cacheKey = AIResponseCache.keyFor(request, providerId, selectedModel);
      const cached = AIResponseCache.get(cacheKey);
      if (cached) {
        return {
          ...cached,
          execution: {
            attemptedProviders,
            fallbackUsed: authorized.fallback,
            latencyMs: 0,
            cached: true,
            routing: request.routingDecision,
          },
        };
      }
      const measured = await LatencyService.measure(() => provider.generate({
        ...request,
        model: selectedModel,
        apiKey: request.apiKeys?.[providerId] ?? request.apiKey,
      }));

      if (!("error" in measured)) {
        const totalTokens = measured.value.usage?.totalTokens ?? TokenCounter.messages(request.history) + TokenCounter.estimate(request.message) + TokenCounter.estimate(measured.value.text);
        addLog({
          provider: providerId,
          model: measured.value.model,
          latencyMs: measured.latencyMs,
          success: true,
          fallback: authorized.fallback,
          tokens: totalTokens,
        });
        const response: AIResponse = {
          ...measured.value,
          execution: {
            attemptedProviders,
            fallbackUsed: authorized.fallback,
            latencyMs: measured.latencyMs,
            routing: request.routingDecision,
          },
        };
        AIResponseCache.set(cacheKey, response);
        return response;
      }

      addLog({
        provider: providerId,
        model: request.models?.[providerId],
        latencyMs: measured.latencyMs,
        success: false,
        fallback: authorized.fallback,
        error: safeAIErrorLogMessage(measured.error),
      });
      if (authorized.fallback) throw measured.error;
      return await requireFallbackConsent(request, preferred, measured.error);
    };

    if (!authorized.fallback || !request.requestOwner || !request.requestId) return execute();
    const key = `${request.requestOwner}:${request.requestId}:${authorized.provider}`;
    const now = Date.now();
    for (const [attemptKey, attempt] of fallbackAttempts) {
      if (attempt.expiresAt <= now) fallbackAttempts.delete(attemptKey);
    }
    const existing = fallbackAttempts.get(key);
    if (existing) return existing.promise;
    const promise = execute();
    fallbackAttempts.set(key, { expiresAt: now + FALLBACK_ATTEMPT_TTL_MS, promise });
    return promise;
  },

  async *stream(request: AIManagerRequest): AsyncGenerator<AIStreamEvent> {
    const preferred = request.provider ?? "gemini";
    if (request.fallbackConsent) {
      const response = await this.generate({ ...request, stream: false });
      yield { type: "delta", text: response.text };
      yield { type: "done", response };
      return;
    }
    const attemptedProviders: AIProviderId[] = [preferred];
    {
      const providerId = preferred;
      const provider = ProviderRegistry.get(providerId);
      const fallback = false;
      const selectedModel = request.model ?? request.models?.[providerId];
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
            execution: { attemptedProviders, fallbackUsed: fallback, latencyMs: 0, cached: true, routing: request.routingDecision },
          },
        };
        return;
      }

      const startedAt = performance.now();
      let emitted = false;
      try {
        if (provider.stream) {
          for await (const event of provider.stream({ ...request, model: selectedModel, stream: true, apiKey: request.apiKeys?.[providerId] ?? request.apiKey })) {
            if (event.type === "delta") {
              emitted = true;
              yield event;
              continue;
            }
            const latencyMs = Math.round(performance.now() - startedAt);
            const response: AIResponse = {
              ...event.response,
              execution: { attemptedProviders, fallbackUsed: fallback, latencyMs, routing: request.routingDecision },
            };
            AIResponseCache.set(cacheKey, response);
            const tokens = response.usage?.totalTokens ?? TokenCounter.messages(request.history) + TokenCounter.estimate(request.message) + TokenCounter.estimate(response.text);
            addLog({ provider: providerId, model: response.model, latencyMs, success: true, fallback, tokens });
            yield { type: "done", response };
            return;
          }
        } else {
          const response = await provider.generate({ ...request, model: selectedModel, stream: false, apiKey: request.apiKeys?.[providerId] ?? request.apiKey });
          for (const line of response.text.match(/.{1,80}(?:\s|$)/g) ?? [response.text]) {
            emitted = true;
            yield { type: "delta", text: line };
          }
          const latencyMs = Math.round(performance.now() - startedAt);
          const completed = { ...response, execution: { attemptedProviders, fallbackUsed: fallback, latencyMs, routing: request.routingDecision } };
          AIResponseCache.set(cacheKey, completed);
          const tokens = response.usage?.totalTokens ?? TokenCounter.messages(request.history) + TokenCounter.estimate(request.message) + TokenCounter.estimate(response.text);
          addLog({ provider: providerId, model: response.model, latencyMs, success: true, fallback, tokens });
          yield { type: "done", response: completed };
          return;
        }
      } catch (error) {
        const latencyMs = Math.round(performance.now() - startedAt);
        addLog({ provider: providerId, model: selectedModel, latencyMs, success: false, fallback, error: safeAIErrorLogMessage(error) });
        if (emitted) {
          throw new AIError(
            "A resposta foi interrompida após o início. O conteúdo parcial foi preservado e não será enviado a outro provedor.",
            "PARTIAL_RESPONSE",
            409,
            providerId,
          );
        }
        if (request.signal?.aborted) throw error;
        await requireFallbackConsent(request, preferred, error);
      }
    }
  },

  inspect(providerId: AIProviderId, options?: { force?: boolean; signal?: AbortSignal; apiKey?: string }) {
    return HealthService.check(providerId, options);
  },

  async status(options?: { force?: boolean; signal?: AbortSignal; apiKeys?: Partial<Record<AIProviderId, string>> }): Promise<AIManagerStatus> {
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
