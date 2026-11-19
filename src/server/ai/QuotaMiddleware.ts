"use server";

import { NextResponse } from "next/server";
import { QuotaService, type QuotaStatus } from "./QuotaService";
import { jsonBody, requireActiveSession, requireCsrf, requireUser } from "@/server/auth/http";
import {
  aiProviderIds,
  type AIFallbackConsent,
  type AIProviderId,
  type AIRoutingDecision,
  type AITaskDescription,
} from "@/features/ai/AIProvider";
import { ApiKeyService } from "./ApiKeyService";
import { AIError } from "@/features/ai/AIErrors";
import type { TutorStudyContext } from "@/types/tutor-context";
import { isTutorStudyContext } from "@/features/tutor/utils/tutor-context-validation";
import { isRetrievedChunk } from "@/features/retrieval/retrieval-validation";
import type { RetrievedChunk } from "@/features/retrieval/RetrievalTypes";
import { needsSharedQuota, providersToCheckFor, quotaExceededMessage, quotaRateLimitHeaders } from "./quota-policy";
import { AIRoutingService } from "./AIRoutingService";

export interface QuotaAwareAIRequest {
  history: readonly { role: "user" | "assistant"; content: string }[];
  message: string;
  model?: string;
  models?: Record<string, string>;
  mode?: "automatic" | "manual";
  provider?: AIProviderId;
  stream?: boolean;
  apiKeys: Partial<Record<AIProviderId, string>> | undefined;
  requestId?: string;
  requestOwner?: string;
  fallbackPolicy?: "consent";
  fallbackConsent?: AIFallbackConsent;
  task?: AITaskDescription;
  routingPolicy?: "smart";
  routingDecision?: AIRoutingDecision;
}

const quotaRuntime = globalThis as typeof globalThis & {
  __studyAIFallbackQuotaAttempts?: Map<string, { expiresAt: number; promise: ReturnType<typeof QuotaService.checkAndConsume> }>;
};
const fallbackQuotaAttempts = quotaRuntime.__studyAIFallbackQuotaAttempts ?? new Map();
quotaRuntime.__studyAIFallbackQuotaAttempts = fallbackQuotaAttempts;

function consumeSharedQuota(userId: string, body: { requestId?: string; fallbackConsent?: AIFallbackConsent }) {
  const consent = body.fallbackConsent;
  if (!body.requestId || !consent || consent.requestId !== body.requestId) {
    return QuotaService.checkAndConsume(userId, { provider: "shared", useSharedKeys: true });
  }
  const now = Date.now();
  for (const [key, attempt] of fallbackQuotaAttempts) {
    if (attempt.expiresAt <= now) fallbackQuotaAttempts.delete(key);
  }
  const key = `${userId}:${body.requestId}:${consent.provider}`;
  const existing = fallbackQuotaAttempts.get(key);
  if (existing) return existing.promise;
  const promise = QuotaService.checkAndConsume(userId, { provider: "shared", useSharedKeys: true });
  fallbackQuotaAttempts.set(key, { expiresAt: now + 5 * 60_000, promise });
  return promise;
}

function attachQuotaHeaders(response: Response, status: QuotaStatus) {
  for (const [name, value] of Object.entries(quotaRateLimitHeaders(status.quota))) {
    response.headers.set(name, value);
  }
  return response;
}

function quotaExceededResponse(status: QuotaStatus) {
  const headers = quotaRateLimitHeaders(status.quota);
  if (status.retryAfter !== undefined) headers["Retry-After"] = String(status.retryAfter);
  return NextResponse.json(
    {
      code: "QUOTA_EXCEEDED",
      error: quotaExceededMessage(status),
      blockedBy: status.blockedBy,
      quota: status.quota,
    },
    { status: 429, headers },
  );
}

export async function withQuotaEnforcement(
  request: Request,
  handler: (request: Request, userApiKeys: Partial<Record<AIProviderId, string>>, quotaInfo: Awaited<ReturnType<typeof QuotaService.getQuotaInfo>>) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    requireCsrf(request);
    const user = requireUser(request);
    await requireActiveSession(request, user);
    const userId = user.sub;

    // Load user's BYOK keys
    const userApiKeys: Partial<Record<AIProviderId, string>> = {};
    try {
      const entries = await Promise.all(
        (await import("@/features/ai/AIProvider")).aiProviderIds.map(async (provider) => [
          provider,
          await (await import("./ApiKeyService")).ApiKeyService.getDecrypted(user.sub, provider),
        ] as const)
      );
      for (const [provider, key] of entries) {
        if (key) userApiKeys[provider] = key;
      }
    } catch {
      // No BYOK keys or error loading
    }

    const quotaInfo = await (await import("./QuotaService")).QuotaService.getQuotaInfo(userId);

    // Determine which providers might be used based on the request
    const body = await request.clone().json().catch(() => null);
    const bodyObj = body as { mode?: string; provider?: string; fallbackConsent?: AIFallbackConsent } | null;
    
    // Determine which providers might be used (same rule as ProviderManager)
    const providersToCheck = providersToCheckFor(bodyObj?.mode, bodyObj?.provider, bodyObj?.fallbackConsent?.provider);

    // Shared quota is only needed when at least one provider in play has no BYOK key.
    if (!needsSharedQuota(providersToCheck, userApiKeys)) {
      const response = await handler(request, userApiKeys, quotaInfo);
      return response;
    }

    // Otherwise, check quota for shared key usage
    const quotaCheck = await (await import("./QuotaService")).QuotaService.checkAndConsume(userId, {
      provider: "shared",
      useSharedKeys: true,
    });

    if (!quotaCheck.allowed) {
      return quotaExceededResponse(quotaCheck);
    }

    const response = await handler(request, userApiKeys, quotaCheck.quota);
    return attachQuotaHeaders(response, quotaCheck) as NextResponse;
  } catch (error) {
    if (error instanceof Response) {
      // Convert plain Response to NextResponse
      return new NextResponse(error.body, {
        status: error.status,
        statusText: error.statusText,
        headers: error.headers,
      });
    }
    const { normalizeAIError } = await import("@/features/ai/AIErrors");
    const normalized = normalizeAIError(error, "Erro inesperado ao processar requisição.");
    return NextResponse.json(normalized.body, { status: normalized.status });
  }
}

export async function createQuotaAwareAIRequest(
  request: Request,
  body: {
    history?: Array<{ role: "user" | "assistant"; content: string }>;
    message?: string;
    model?: string;
    models?: Record<string, string>;
    mode?: "automatic" | "manual";
    provider?: string;
    stream?: boolean;
    teaching?: unknown;
    context?: { studyId?: string } | unknown;
    chunks?: unknown[];
    requestId?: string;
    fallbackPolicy?: "consent";
    fallbackConsent?: AIFallbackConsent;
  },
  userId: string,
  userApiKeys: Partial<Record<string, string>>,
  routing?: { task?: AITaskDescription; routingPolicy?: "smart"; promptPrepared?: boolean },
) {
  const safeHistory = Array.isArray(body.history) ? body.history : [];
  const safeMessage = typeof body.message === "string" ? body.message : "";
  const studyContext = isTutorStudyContext(body.context) ? body.context : undefined;
  const chunks = Array.isArray(body.chunks)
    ? body.chunks.filter(isRetrievedChunk)
    : ([] as RetrievedChunk[]);

  const prompt = routing?.promptPrepared
    ? { history: safeHistory, message: safeMessage }
    : (await import("@/features/ai/PromptBuilder")).PromptBuilder.contextual({
        question: safeMessage,
        history: safeHistory,
        studyContext: studyContext as TutorStudyContext | null | undefined,
        chunks,
        teaching: body.teaching as import("@/features/teacher/types").TeacherRequest | undefined,
      });

  return {
    history: prompt.history,
    message: prompt.message,
    model: body.model,
    models: body.models,
    mode: body.mode,
    provider: body.provider as AIProviderId | undefined,
    stream: body.stream,
    apiKeys: Object.keys(userApiKeys).length > 0 ? userApiKeys : undefined,
    requestId: body.requestId,
    requestOwner: userId,
    fallbackPolicy: body.fallbackPolicy,
    fallbackConsent: body.fallbackConsent,
    task: routing?.task,
    routingPolicy: routing?.routingPolicy,
  };
}

export async function withAIQuota(
  request: Request,
  handler: (request: Request, aiRequest: QuotaAwareAIRequest) => Promise<NextResponse | Response>,
  prepared?: {
    history: QuotaAwareAIRequest["history"];
    message: string;
    task?: AITaskDescription;
    routingPolicy?: "smart";
    maxBytes?: number;
    validate?: (body: unknown) => string | null;
  }
): Promise<NextResponse | Response> {
  try {
    // Lê um clone: o corpo original continua disponível para handlers que
    // validam o payload novamente (ex.: diagrams, lab, audio-lesson). Um
    // Request só pode ser consumido uma vez.
    requireCsrf(request);
    const user = requireUser(request);
    await requireActiveSession(request, user);
    const userId = user.sub;

    const maxBytes = prepared?.maxBytes ?? 512 * 1024;
    const originalBody = await jsonBody<unknown>(request.clone(), maxBytes);
    if (!originalBody || typeof originalBody !== "object" || Array.isArray(originalBody)) {
      return NextResponse.json({ code: "INVALID_REQUEST", error: "Corpo da requisição inválido." }, { status: 400 });
    }
    if (prepared?.validate) {
      const validationError = prepared.validate(originalBody);
      if (validationError) {
        return NextResponse.json({ code: "INVALID_REQUEST", error: validationError }, { status: 400 });
      }
    }
    const body = (prepared
      ? { ...originalBody, ...prepared, chunks: undefined, context: undefined }
      : originalBody) as Parameters<typeof createQuotaAwareAIRequest>[1];

    // Load user's BYOK keys
    const userApiKeys: Partial<Record<string, string>> = {};
    const entries = await Promise.allSettled(aiProviderIds.map((provider) => ApiKeyService.getDecrypted(user.sub, provider)));
    const bodyObj = body as { mode?: string; provider?: string; requestId?: string; fallbackConsent?: AIFallbackConsent };
    const requestedProvider = bodyObj.fallbackConsent?.provider ?? bodyObj.provider ?? "gemini";
    for (const [index, entry] of entries.entries()) {
      const provider = aiProviderIds[index];
      if (entry.status === "fulfilled" && entry.value) userApiKeys[provider] = entry.value;
      if (entry.status === "rejected" && provider === requestedProvider) {
        throw new AIError("Não foi possível ler a chave salva deste provedor. Confira Configurações de IA.", "PROVIDER_ERROR", 503, provider);
      }
    }

    const baseAIRequest = await createQuotaAwareAIRequest(request, body, userId, userApiKeys, {
      task: prepared?.task,
      routingPolicy: prepared?.routingPolicy,
      promptPrepared: Boolean(prepared),
    });
    let routingQuota: Awaited<ReturnType<typeof QuotaService.getQuotaInfo>> | undefined;
    if (baseAIRequest.routingPolicy === "smart" && baseAIRequest.mode === "automatic" && !baseAIRequest.fallbackConsent) {
      try {
        routingQuota = await QuotaService.getQuotaInfo(userId);
      } catch {
        // Quota desconhecida nunca é tratada como ilimitada pelo roteador.
      }
    }
    const aiRequest = await AIRoutingService.resolve(baseAIRequest, routingQuota);
    const providersToCheck = providersToCheckFor(
      aiRequest.mode,
      aiRequest.provider,
      aiRequest.fallbackConsent?.provider,
    );

    if (!needsSharedQuota(providersToCheck, userApiKeys)) {
      // User has BYOK for all providers that might be used - bypass quota
      return handler(request, aiRequest) as Promise<NextResponse | Response>;
    }

    // Otherwise, check quota for shared key usage
    const quotaCheck = await consumeSharedQuota(userId, bodyObj);

    if (!quotaCheck.allowed) {
      return quotaExceededResponse(quotaCheck);
    }

    const response = await (handler as unknown as (request: Request, aiRequest: QuotaAwareAIRequest) => Promise<NextResponse | Response>)(
      request,
      aiRequest
    );
    return attachQuotaHeaders(response, quotaCheck);
  } catch (error) {
    if (error instanceof Response) return error as NextResponse | Response;
    const { normalizeAIError } = await import("@/features/ai/AIErrors");
    const normalized = normalizeAIError(error, "Erro inesperado ao processar requisição.");
    return NextResponse.json(normalized.body, { status: normalized.status }) as NextResponse | Response;
  }
}
