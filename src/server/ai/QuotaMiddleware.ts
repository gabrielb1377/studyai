"use server";

import { NextResponse } from "next/server";
import { QuotaService } from "./QuotaService";
import { requireUser } from "@/server/auth/http";
import { aiProviderIds, type AIProviderId } from "@/features/ai/AIProvider";
import { ApiKeyService } from "./ApiKeyService";
import { AIService } from "@/features/ai/AIService";
import { normalizeAIError } from "@/features/ai/AIErrors";
import type { AIManagerRequest } from "@/features/ai/AIProvider";
import type { TutorStudyContext } from "@/types/tutor-context";

const FALLBACK_ORDER: readonly AIProviderId[] = ["ollama", "gemini", "groq", "openrouter"];

export interface QuotaAwareAIRequest {
  history: Array<{ role: "user" | "assistant"; content: string }>;
  message: string;
  model?: string;
  models?: Record<string, string>;
  mode?: "automatic" | "manual";
  provider?: AIProviderId;
  stream?: boolean;
  apiKeys: Partial<Record<AIProviderId, string>> | undefined;
}

export async function withQuotaEnforcement(
  request: Request,
  handler: (request: Request, userApiKeys: Partial<Record<AIProviderId, string>>, quotaInfo: Awaited<ReturnType<typeof QuotaService.getQuotaInfo>>) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    const user = requireUser(request);
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
    const body = await request.json().catch(() => null);
    const bodyObj = body as { mode?: string; provider?: string } | null;
    
    // Determine which providers might be used
    let providersToCheck: AIProviderId[] = [];
    if (bodyObj?.mode === "manual" && bodyObj?.provider) {
      // Manual mode: only the specified provider
      providersToCheck = [bodyObj.provider as AIProviderId];
    } else {
      // Automatic mode: check all providers in fallback order
      providersToCheck = [...FALLBACK_ORDER];
    }

    // Check if user has BYOK keys for ALL providers that might be used
    const hasKeysForAllProviders = providersToCheck.every(provider => userApiKeys[provider]);

    // If user has BYOK keys for ALL providers that might be used, bypass shared quota
    if (hasKeysForAllProviders) {
      const response = await handler(request, userApiKeys, quotaInfo);
      return response;
    }

    // Otherwise, check quota for shared key usage
    const quotaCheck = await (await import("./QuotaService")).QuotaService.checkAndConsume(userId, {
      provider: "shared",
      useSharedKeys: true,
    });

    if (!quotaCheck.allowed) {
      const dayEnd = new Date();
      dayEnd.setHours(24, 0, 0, 0);
      const minuteEnd = new Date(Math.ceil(Date.now() / 60_000) * 60_000);
      return NextResponse.json(
        {
          code: "QUOTA_EXCEEDED",
          error: "Cota diária de IA compartilhada esgotada. Configure sua própria chave de API (BYOK) em Configurações → IA para continuar sem limites.",
          quota: {
            daily: { limit: 500, remaining: 0, resetAt: dayEnd.toISOString() },
            minute: { limit: 20, remaining: 0, resetAt: minuteEnd.toISOString() },
          },
        },
        {
          status: 429,
          headers: {
            "Retry-After": "60",
            "X-RateLimit-Limit": "500",
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": Math.ceil(Date.now() / 1000 + 86400).toString(),
          },
        }
      );
    }

    // Add quota headers to response
    const dayEnd = new Date();
    dayEnd.setHours(24, 0, 0, 0);
    const minuteEnd = new Date(Math.ceil(Date.now() / 60_000) * 60_000);
    const response: NextResponse = await (handler as (request: Request, userApiKeys: Partial<Record<AIProviderId, string>>, quotaInfo: Awaited<ReturnType<typeof QuotaService.getQuotaInfo>>) => Promise<NextResponse>)(
      request,
      {} as Partial<Record<AIProviderId, string>>,
      { daily: { used: 0, limit: 500, remaining: 499, resetAt: dayEnd.toISOString() }, minute: { used: 1, limit: 20, remaining: 19, resetAt: minuteEnd.toISOString() }, sharedKeysUsed: true }
    );

    // Add quota headers
    response.headers.set("X-RateLimit-Limit", "500");
    response.headers.set("X-RateLimit-Remaining", "499");
    response.headers.set("X-RateLimit-Reset", Math.ceil(Date.now() / 1000 + 86400).toString());

    return response;
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
    history: Array<{ role: "user" | "assistant"; content: string }>;
    message: string;
    model?: string;
    models?: Record<string, string>;
    mode?: "automatic" | "manual";
    provider?: string;
    stream?: boolean;
    teaching?: unknown;
    context?: { studyId?: string } | unknown;
    chunks?: unknown[];
  },
  userId: string,
  userApiKeys: Partial<Record<string, string>>
) {
  const { RetrievalPipeline } = await import("@/features/ai/RetrievalPipeline");

  const studyContext = body.context as { studyId?: string } | undefined;
  let chunks = body.chunks as unknown[] | undefined;

  if (!chunks && studyContext?.studyId) {
    const retrieved = await (await import("@/features/ai/RetrievalPipeline")).RetrievalPipeline.forStudy(studyContext.studyId);
    chunks = retrieved.chunks;
  }

  const prompt = (await import("@/features/ai/PromptBuilder")).PromptBuilder.contextual({
    question: body.message,
    history: body.history,
    studyContext: studyContext as TutorStudyContext | null | undefined,
    chunks: (chunks ?? []) as unknown as readonly import("@/features/retrieval/RetrievalTypes").RetrievedChunk[],
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
  };
}

export async function withAIQuota(
  request: Request,
  handler: (request: Request, aiRequest: QuotaAwareAIRequest) => Promise<NextResponse | Response>
): Promise<NextResponse | Response> {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ code: "INVALID_REQUEST", error: "Corpo da requisição inválido." }, { status: 400 });
    }

    const user = requireUser(request);
    const userId = user.sub;

    // Load user's BYOK keys
    let userApiKeys: Partial<Record<string, string>> = {};
    try {
      const entries = await Promise.all(
        (await import("@/features/ai/AIProvider")).aiProviderIds.map(async (provider) => [
          provider,
          await (await import("./ApiKeyService")).ApiKeyService.getDecrypted(user.sub, provider),
        ] as const)
      );
      for (const [provider, key] of entries) if (key) userApiKeys[provider] = key;
    } catch {
      userApiKeys = {};
    }

    // Determine which providers might be used based on the request
    const bodyObj = body as { mode?: string; provider?: string } | null;
    
    // Determine which providers might be used
    let providersToCheck: string[] = [];
    if (bodyObj?.mode === "manual" && bodyObj?.provider) {
      // Manual mode: only the specified provider
      providersToCheck = [bodyObj.provider];
    } else {
      // Automatic mode: check all providers in fallback order
      providersToCheck = [...FALLBACK_ORDER];
    }

    // Check if user has BYOK keys for ALL providers that might be used
    const hasKeysForAllProviders = providersToCheck.every(provider => userApiKeys[provider]);

    if (hasKeysForAllProviders) {
      // User has BYOK for all providers that might be used - bypass quota
      const aiRequest = await createQuotaAwareAIRequest(request, body, userId, userApiKeys);
      return handler(request, aiRequest) as Promise<NextResponse | Response>;
    }

    // Otherwise, check quota for shared key usage
    const { QuotaService } = await import("./QuotaService");
    const quotaCheck = await QuotaService.checkAndConsume(userId, {
      provider: "shared",
      useSharedKeys: true,
    });

    if (!quotaCheck.allowed) {
      const dayEnd = new Date();
      dayEnd.setHours(24, 0, 0, 0);
      const minuteEnd = new Date(Math.ceil(Date.now() / 60_000) * 60_000);
      return NextResponse.json(
        {
          code: "QUOTA_EXCEEDED",
          error: "Cota diária de IA compartilhada esgotada. Configure sua própria chave de API (BYOK) em Configurações → IA para continuar sem limites.",
          quota: {
            daily: { limit: 500, remaining: 0, resetAt: dayEnd.toISOString() },
            minute: { limit: 20, remaining: 0, resetAt: minuteEnd.toISOString() },
          },
        },
        { status: 429 }
      );
    }

    // Add quota headers to response
    const dayEnd = new Date();
    dayEnd.setHours(24, 0, 0, 0);
    const minuteEnd = new Date(Math.ceil(Date.now() / 60_000) * 60_000);
    const quotaInfo: Awaited<ReturnType<typeof QuotaService.getQuotaInfo>> = { daily: { used: 0, limit: 500, remaining: 499, resetAt: dayEnd.toISOString() }, minute: { used: 1, limit: 20, remaining: 19, resetAt: minuteEnd.toISOString() }, sharedKeysUsed: true };
    const aiRequest = await createQuotaAwareAIRequest(request, body, userId, userApiKeys);
    const response = await (handler as unknown as (request: Request, aiRequest: QuotaAwareAIRequest) => Promise<NextResponse | Response>)(
      request,
      aiRequest
    );
    response.headers.set("X-RateLimit-Limit", "500");
    response.headers.set("X-RateLimit-Remaining", "499");
    response.headers.set("X-RateLimit-Reset", Math.ceil(Date.now() / 1000 + 86400).toString());

    return response;
  } catch (error) {
    if (error instanceof Response) return error as NextResponse | Response;
    const { normalizeAIError } = await import("@/features/ai/AIErrors");
    const normalized = normalizeAIError(error, "Erro inesperado ao processar requisição.");
    return NextResponse.json(normalized.body, { status: normalized.status }) as NextResponse | Response;
  }
}