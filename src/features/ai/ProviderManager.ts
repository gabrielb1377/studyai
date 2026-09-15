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

function orderFrom(preferred: AIProviderId): AIProviderId[] {
  return [preferred, ...FALLBACK_ORDER.filter((provider) => provider !== preferred)];
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
      : orderFrom(preferred);
    const attemptedProviders: AIProviderId[] = [];
    let lastError: unknown;

    for (const providerId of candidates) {
      if (request.signal?.aborted) throw lastError ?? new AIError("Operação cancelada.", "TIMEOUT", 499);
      const provider = ProviderRegistry.get(providerId);
      const fallback = attemptedProviders.length > 0;
      attemptedProviders.push(providerId);
      const measured = await LatencyService.measure(() => provider.generate({
        ...request,
        model: request.models?.[providerId] ?? (providerId === preferred ? request.model : undefined),
      }));

      if (!("error" in measured)) {
        const totalTokens = measured.value.usage?.totalTokens;
        addLog({
          provider: providerId,
          model: measured.value.model,
          latencyMs: measured.latencyMs,
          success: true,
          fallback,
          tokens: totalTokens,
        });
        return {
          ...measured.value,
          execution: {
            attemptedProviders,
            fallbackUsed: fallback,
            latencyMs: measured.latencyMs,
          },
        };
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

  inspect(providerId: AIProviderId, signal?: AbortSignal) {
    return HealthService.check(providerId, { signal });
  },

  async status(options?: { force?: boolean; signal?: AbortSignal }): Promise<AIManagerStatus> {
    return {
      providers: await HealthService.checkAll(options),
      statistics: statistics(),
      logs: logs.slice(0, 30),
    };
  },
};
