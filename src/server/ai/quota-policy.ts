import type { AIProviderId } from "@/features/ai/AIProvider";

/**
 * Regras puras de decisão de quota compartilhada.
 *
 * Mantidas fora do `QuotaMiddleware` (que é `server-only`) para poderem ser
 * exercitadas por testes sem subir o servidor. A semântica espelha o
 * `ProviderManager`: apenas o modo `automatic` percorre a cadeia de fallback.
 */

export const FALLBACK_ORDER: readonly AIProviderId[] = ["ollama", "gemini", "groq", "openrouter"];

// Ollama roda localmente e nunca consome credencial compartilhada.
export const KEYLESS_PROVIDERS: readonly string[] = ["ollama"];

export function providersToCheckFor(
  mode: string | undefined,
  provider: string | undefined
): AIProviderId[] {
  if (mode === "automatic") return [...FALLBACK_ORDER];
  return [(provider as AIProviderId | undefined) ?? "gemini"];
}

/**
 * `true` quando pelo menos um provider que pode ser usado não tem chave BYOK.
 * Nesse caso a quota compartilhada precisa ser autorizada antes da chamada.
 *
 * Limite conhecido: com BYOK parcial em modo automático, a quota é consumida
 * mesmo que o provider BYOK vença a chamada (comportamento conservador).
 */
export function needsSharedQuota(
  providers: readonly string[],
  userApiKeys: Partial<Record<AIProviderId, string>>
): boolean {
  return providers
    .filter((provider) => !KEYLESS_PROVIDERS.includes(provider))
    .some((provider) => !userApiKeys[provider as AIProviderId]);
}
