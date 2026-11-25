"use server";

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { estimateReservationTokens, QuotaService, type QuotaStatus } from "./QuotaService";
import { jsonBody, requireActiveSession, requireCsrf, requireUser } from "@/server/auth/http";
import {
  aiProviderIds,
  type AIFallbackConsent,
  type AIProviderId,
  type AIRoutingDecision,
  type AITaskDescription,
  type AIUsageSettlement,
} from "@/features/ai/AIProvider";
import { ApiKeyService } from "./ApiKeyService";
import { AIError } from "@/features/ai/AIErrors";
import type { TutorStudyContext } from "@/types/tutor-context";
import { isTutorStudyContext } from "@/features/tutor/utils/tutor-context-validation";
import { isRetrievedChunk } from "@/features/retrieval/retrieval-validation";
import type { RetrievedChunk } from "@/features/retrieval/RetrievalTypes";
import {
  needsSharedQuota,
  providersToCheckFor,
  quotaExceededMessage,
  quotaRateLimitHeaders,
  resolveCredentialOrigin,
} from "./quota-policy";
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
  strictByok?: boolean;
  credentialOrigin?: "shared" | "byok" | "local";
  emailVerified?: boolean;
  onSettlement?: (settlement: AIUsageSettlement) => Promise<void> | void;
  requestId?: string;
  requestOwner?: string;
  fallbackPolicy?: "consent";
  fallbackConsent?: AIFallbackConsent;
  task?: AITaskDescription;
  routingPolicy?: "smart";
  routingDecision?: AIRoutingDecision;
}

const quotaRuntime = globalThis as typeof globalThis & {
  __studyAIFallbackQuotaAttempts?: Map<string, { expiresAt: number; promise: Promise<QuotaStatus> }>;
};
const fallbackQuotaAttempts = quotaRuntime.__studyAIFallbackQuotaAttempts ?? new Map();
quotaRuntime.__studyAIFallbackQuotaAttempts = fallbackQuotaAttempts;

function consumeSharedQuota(
  userId: string,
  body: { requestId?: string; fallbackConsent?: AIFallbackConsent },
  reservation: { provider: string; model?: string; reserveTokens: number },
): Promise<QuotaStatus> {
  const execute = () => {
    if (typeof QuotaService.reserveSharedBudget === "function") {
      return QuotaService.reserveSharedBudget(userId, {
        provider: reservation.provider,
        model: reservation.model,
        requestId: body.requestId,
        reserveTokens: reservation.reserveTokens,
        useSharedKeys: true,
      });
    }
    return QuotaService.checkAndConsume(userId, { provider: "shared", useSharedKeys: true });
  };

  const consent = body.fallbackConsent;
  if (!body.requestId || !consent || consent.requestId !== body.requestId) {
    return execute();
  }
  const now = Date.now();
  for (const [key, attempt] of fallbackQuotaAttempts) {
    if (attempt.expiresAt <= now) fallbackQuotaAttempts.delete(key);
  }
  const key = `${userId}:${body.requestId}:${consent.provider}`;
  const existing = fallbackQuotaAttempts.get(key);
  if (existing) return existing.promise;
  const promise = execute();
  fallbackQuotaAttempts.set(key, { expiresAt: now + 5 * 60_000, promise });
  return promise;
}

function attachQuotaHeaders(response: Response, status: QuotaStatus) {
  for (const [name, value] of Object.entries(quotaRateLimitHeaders(status.quota))) {
    response.headers.set(name, value);
  }
  return response;
}

function quotaBlockedResponse(status: QuotaStatus) {
  const headers = quotaRateLimitHeaders(status.quota);
  if (status.retryAfter !== undefined) headers["Retry-After"] = String(status.retryAfter);
  if (status.blockedBy === "global_budget") {
    // Nunca expor números internos do orçamento global ao cliente.
    return NextResponse.json(
      {
        code: "SHARED_AI_UNAVAILABLE",
        error: quotaExceededMessage(status),
        suggestion: "Tente novamente mais tarde ou configure sua própria chave de API (BYOK) em Configurações → IA.",
        blockedBy: "global_budget",
      },
      { status: 503, headers: { "cache-control": "no-store", ...(status.retryAfter ? { "Retry-After": String(status.retryAfter) } : {}) } },
    );
  }
  return NextResponse.json(
    {
      code: "QUOTA_EXCEEDED",
      error: quotaExceededMessage(status),
      suggestion: "Aguarde a renovação da cota ou configure sua própria chave de API (BYOK) em Configurações → IA.",
      blockedBy: status.blockedBy,
      quota: status.quota,
    },
    { status: 429, headers },
  );
}

function emailNotVerifiedResponse() {
  return NextResponse.json(
    {
      code: "EMAIL_NOT_VERIFIED",
      error: "Verifique seu e-mail antes de usar a IA compartilhada do StudyAI.",
      suggestion: "Confirme seu e-mail em Conta ou configure sua própria chave de API (BYOK) em Configurações → IA.",
    },
    { status: 403, headers: { "cache-control": "no-store" } },
  );
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
): Promise<QuotaAwareAIRequest> {
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
    // Origem e chaves são resolvidas exclusivamente pelo servidor; nunca aceitas do cliente.
    apiKeys: Object.keys(userApiKeys).length > 0 ? userApiKeys : undefined,
    requestId: body.requestId,
    requestOwner: userId,
    fallbackPolicy: body.fallbackPolicy,
    fallbackConsent: body.fallbackConsent,
    task: routing?.task,
    routingPolicy: routing?.routingPolicy,
  };
}

/**
 * Fronteira canônica de segurança e governança para todas as rotas de geração de IA.
 */
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
  let activeReservationId: string | undefined;
  let activeInputEstimate: number | undefined;
  let settled = false;

  const reconcileOnce = async (settlement: AIUsageSettlement) => {
    if (settled || !activeReservationId || typeof QuotaService.reconcileReservation !== "function") return;
    settled = true;
    await QuotaService.reconcileReservation(activeReservationId, settlement, {
      inputEstimate: activeInputEstimate,
    });
  };

  try {
    // Ordem obrigatória: CSRF -> autenticação -> sessão ativa -> validação de payload -> BYOK/e-mail/orçamento.
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
    // Nunca confiar em campos de origem de chave ou credenciais enviados pelo cliente.
    const sanitizedBody = { ...(originalBody as Record<string, unknown>) };
    delete sanitizedBody.apiKey;
    delete sanitizedBody.apiKeys;
    delete sanitizedBody.credentialOrigin;
    delete sanitizedBody.strictByok;
    delete sanitizedBody.emailVerified;
    delete sanitizedBody.onSettlement;

    const body = (prepared
      ? { ...sanitizedBody, ...prepared, chunks: undefined, context: undefined }
      : sanitizedBody) as Parameters<typeof createQuotaAwareAIRequest>[1];

    // Carregar chaves BYOK do usuário exclusivamente no servidor
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
    const effectiveProvider = providersToCheck[0] ?? "gemini";
    const credentialOrigin = resolveCredentialOrigin(providersToCheck, userApiKeys);

    // Verificar e-mail no servidor quando necessário (e passar sinalização ao ProviderManager para não oferecer fallback compartilhado)
    const emailVerified = typeof QuotaService.isEmailVerified === "function"
      ? await QuotaService.isEmailVerified(userId)
      : true;

    aiRequest.credentialOrigin = credentialOrigin;
    aiRequest.strictByok = credentialOrigin === "byok";
    aiRequest.emailVerified = emailVerified;

    if (!needsSharedQuota(providersToCheck, userApiKeys)) {
      // Usuário usa BYOK ou Ollama local — não consome cota/orçamento compartilhado.
      return handler(request, aiRequest) as Promise<NextResponse | Response>;
    }

    // Gate Lote 3B: IA compartilhada exige e-mail verificado no servidor antes de qualquer reserva ou chamada ao provedor.
    if (!emailVerified) {
      return emailNotVerifiedResponse();
    }

    const estimate = typeof estimateReservationTokens === "function"
      ? estimateReservationTokens({
          history: aiRequest.history,
          message: aiRequest.message,
          maxOutputTokens: aiRequest.routingDecision?.maxOutputTokens ?? aiRequest.task?.maxOutputTokens,
        })
      : { inputEstimate: 0, reserveTokens: 2_000 };
    activeInputEstimate = estimate.inputEstimate;

    const effectiveRequestId = bodyObj.requestId?.trim() || randomUUID();
    const quotaCheck = await consumeSharedQuota(
      userId,
      { ...bodyObj, requestId: effectiveRequestId },
      {
        provider: effectiveProvider,
        model: aiRequest.model ?? aiRequest.routingDecision?.model,
        reserveTokens: estimate.reserveTokens,
      },
    );

    if (!quotaCheck.allowed) {
      return quotaBlockedResponse(quotaCheck);
    }

    activeReservationId = quotaCheck.reservationId;
    aiRequest.onSettlement = reconcileOnce;

    const response = await (handler as unknown as (request: Request, aiRequest: QuotaAwareAIRequest) => Promise<NextResponse | Response>)(
      request,
      aiRequest,
    );

    // Segurança para handlers não-streaming que retornaram erro HTTP antes de chamar AIService (ex.: 400/502)
    const isStreamResponse = response.headers.get("content-type")?.includes("application/x-ndjson");
    if (!isStreamResponse && !settled && activeReservationId) {
      if (!response.ok) {
        await reconcileOnce({
          outcome: "failed",
          provider: effectiveProvider,
          model: aiRequest.model,
          emittedOutput: false,
          providerContacted: response.status >= 500,
        });
      }
    }

    return attachQuotaHeaders(response, quotaCheck);
  } catch (error) {
    if (activeReservationId && !settled) {
      await reconcileOnce({
        outcome: "failed",
        provider: "gemini",
        emittedOutput: false,
        providerContacted: false,
      }).catch(() => undefined);
    }
    if (error instanceof Response) return error as NextResponse | Response;
    const { normalizeAIError } = await import("@/features/ai/AIErrors");
    const normalized = normalizeAIError(error, "Erro inesperado ao processar requisição.");
    return NextResponse.json(normalized.body, { status: normalized.status }) as NextResponse | Response;
  }
}
