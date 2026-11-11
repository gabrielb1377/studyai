import "server-only";

import { AIRouter, type AIRoutingCandidate } from "@/features/ai/AIRouter";
import { AIError } from "@/features/ai/AIErrors";
import { HealthService } from "@/features/ai/HealthService";
import type { AIManagerRequest, AIModel, AIProviderId, AIRoutingDecision } from "@/features/ai/AIProvider";
import type { QuotaInfo } from "./QuotaService";

function credentialFor(provider: AIProviderId, apiKeys: AIManagerRequest["apiKeys"]): AIRoutingDecision["credential"] {
  if (provider === "ollama") return "local";
  return apiKeys?.[provider] ? "byok" : "shared_quota";
}

function sharedQuotaState(quota?: QuotaInfo): AIRoutingCandidate["sharedQuota"] {
  if (!quota) return "unknown";
  return quota.daily.remaining > 0 && quota.minute.remaining > 0 ? "available" : "exhausted";
}

export const AIRoutingService = {
  async resolve<T extends AIManagerRequest>(request: T, quota?: QuotaInfo): Promise<T> {
    if (request.routingPolicy !== "smart" || !request.task || request.fallbackConsent) {
      return {
        ...request,
        maxOutputTokens: request.maxOutputTokens ?? request.task?.maxOutputTokens,
      } as T;
    }

    const statuses = request.mode === "automatic"
      ? await HealthService.checkAll({ signal: request.signal, apiKeys: request.apiKeys })
      : [];
    const automaticCandidates: AIRoutingCandidate[] = statuses.flatMap((status) => status.models.map((model: AIModel) => ({
      provider: status.provider,
      model,
      available: status.available,
      capabilities: [
        "text" as const,
        "structured_text" as const,
        ...(model.contextWindow && model.contextWindow > 8_192 ? ["long_context" as const] : []),
      ],
      credential: credentialFor(status.provider, request.apiKeys),
      sharedQuota: sharedQuotaState(quota),
    })));
    const preferredProvider = request.provider ?? "gemini";
    const preferredModel = request.model ?? request.models?.[preferredProvider];
    const candidates = request.mode === "automatic"
      ? automaticCandidates
      : [{
          provider: preferredProvider,
          model: { name: preferredModel ?? "modelo selecionado pelo provider" },
          available: true,
          capabilities: ["text" as const, "structured_text" as const],
          credential: credentialFor(preferredProvider, request.apiKeys),
          sharedQuota: sharedQuotaState(quota),
        }];
    const result = AIRouter.select({
      mode: request.mode,
      preferredProvider,
      preferredModel,
      task: request.task,
      candidates,
    });
    if (!result.decision) {
      const quotaBlocked = result.rejected.length > 0 && result.rejected.every((item) => item.reason === "quota_exhausted" || item.reason === "quota_unknown");
      throw new AIError(
        quotaBlocked
          ? "Nenhum modelo automático pode ser usado com segurança porque a quota compartilhada está esgotada ou indisponível. Escolha um provider com BYOK ou Ollama."
          : "Nenhum modelo disponível atende aos requisitos desta tarefa. Escolha manualmente um provider/modelo compatível.",
        quotaBlocked ? "RATE_LIMIT" : "PROVIDER_UNAVAILABLE",
        quotaBlocked ? 429 : 503,
        request.provider,
      );
    }
    return {
      ...request,
      provider: result.decision.provider,
      model: result.decision.model,
      maxOutputTokens: Math.min(request.maxOutputTokens ?? Number.MAX_SAFE_INTEGER, result.decision.maxOutputTokens),
      routingDecision: result.decision,
    } as T;
  },
};
