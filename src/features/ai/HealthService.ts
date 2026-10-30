import "server-only";

import type { AIProviderId, AIProviderStatus } from "./AIProvider";
import { LatencyService } from "./LatencyService";
import { ProviderRegistry } from "./ProviderRegistry";

const CACHE_DURATION_MS = 30_000;
const healthRuntime = globalThis as typeof globalThis & {
  __studyAIHealthCache?: Map<AIProviderId, { expiresAt: number; status: AIProviderStatus }>;
};
const cache = healthRuntime.__studyAIHealthCache ?? new Map();
healthRuntime.__studyAIHealthCache = cache;

async function inspect(providerId: AIProviderId, signal?: AbortSignal, apiKey?: string): Promise<AIProviderStatus> {
  const provider = ProviderRegistry.get(providerId);
  const measured = await LatencyService.measure(async () => {
    if (provider.inspect) return provider.inspect(signal, apiKey);
    return {
      provider: provider.id,
      available: provider.available,
      latencyMs: 0,
      models: [],
      error: provider.available ? undefined : `O provider ${provider.name} ainda não está disponível.`,
    } satisfies AIProviderStatus;
  });

  const checkedAt = new Date().toISOString();
  if ("error" in measured) {
    return {
      provider: providerId,
      available: false,
      latencyMs: measured.latencyMs,
      models: [],
      checkedAt,
      error: "Não foi possível verificar o provider.",
    };
  }
  return { ...measured.value, latencyMs: measured.latencyMs, checkedAt };
}

export const HealthService = {
  async check(providerId: AIProviderId, options?: { force?: boolean; signal?: AbortSignal; apiKey?: string }) {
    // BYOK results must never enter the process-wide provider cache.
    if (options?.apiKey) return inspect(providerId, options.signal, options.apiKey);
    const cached = cache.get(providerId);
    if (!options?.force && cached && cached.expiresAt > Date.now()) return cached.status;
    const status = await inspect(providerId, options?.signal);
    cache.set(providerId, { expiresAt: Date.now() + CACHE_DURATION_MS, status });
    return status;
  },

  checkAll(options?: { force?: boolean; signal?: AbortSignal; apiKeys?: Partial<Record<AIProviderId, string>> }) {
    return Promise.all(
      ProviderRegistry.list().map((provider) => this.check(provider.id, { ...options, apiKey: options?.apiKeys?.[provider.id] })),
    );
  },

  clear() {
    cache.clear();
  },
};
