import type { AIProviderId } from "@/features/ai/AIProvider";
import type { QuotaInfo, QuotaStatus } from "./QuotaService";

/**
 * Regras puras de decisão de quota compartilhada.
 *
 * Mantidas fora do `QuotaMiddleware` (que é `server-only`) para poderem ser
 * exercitadas por testes sem subir o servidor. A semântica espelha o
 * `ProviderManager`: uma requisição usa somente o provider escolhido. Uma
 * alternativa só entra na política após consentimento explícito.
 */

export const FALLBACK_ORDER: readonly AIProviderId[] = ["ollama", "gemini", "groq", "openrouter"];

// Ollama roda localmente e nunca consome credencial compartilhada.
export const KEYLESS_PROVIDERS: readonly string[] = ["ollama"];

export function providersToCheckFor(
  _mode: string | undefined,
  provider: string | undefined,
  consentedProvider?: string,
): AIProviderId[] {
  if (consentedProvider) return [consentedProvider as AIProviderId];
  return [(provider as AIProviderId | undefined) ?? "gemini"];
}

/**
 * `true` quando pelo menos um provider que pode ser usado não tem chave BYOK.
 * Nesse caso a quota compartilhada precisa ser autorizada antes da chamada.
 *
 * A autorização é feita por tentativa. Assim, a tentativa alternativa
 * consentida não herda indevidamente a credencial ou a quota da primária.
 */
export function needsSharedQuota(
  providers: readonly string[],
  userApiKeys: Partial<Record<AIProviderId, string>>
): boolean {
  return providers
    .filter((provider) => !KEYLESS_PROVIDERS.includes(provider))
    .some((provider) => !userApiKeys[provider as AIProviderId]);
}

export function quotaRateLimitHeaders(quota: QuotaInfo): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(quota.daily.limit),
    "X-RateLimit-Remaining": String(quota.daily.remaining),
    "X-RateLimit-Reset": String(Math.ceil(Date.parse(quota.daily.resetAt) / 1_000)),
    "X-StudyAI-Minute-Limit": String(quota.minute.limit),
    "X-StudyAI-Minute-Remaining": String(quota.minute.remaining),
    "X-StudyAI-Minute-Reset": String(Math.ceil(Date.parse(quota.minute.resetAt) / 1_000)),
  };
}

export function quotaExceededMessage(status: Pick<QuotaStatus, "blockedBy">): string {
  return status.blockedBy === "minute"
    ? "Limite de IA compartilhada por minuto atingido. Aguarde o tempo indicado antes de tentar novamente."
    : "Cota diária de IA compartilhada esgotada. Configure sua própria chave de API (BYOK) em Configurações → IA para continuar.";
}
