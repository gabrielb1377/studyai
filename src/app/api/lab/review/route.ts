import { NextResponse } from "next/server";
import { normalizeAIError } from "@/features/ai/AIErrors";
import { AIService } from "@/features/ai/AIService";
import { ApiKeyService } from "@/server/ai/ApiKeyService";
import { requireUser } from "@/server/auth/http";
import { aiProviderIds } from "@/features/ai/AIProvider";
import { LabPromptBuilder } from "@/features/lab/services/LabPromptBuilder";
import { isLabReviewRequest } from "@/features/lab/validators/lab-validation";
import { isAIModelPreferences, isAIProviderId, isAISelectionMode, type AIModelPreferences, type AIProviderId, type AISelectionMode } from "@/features/ai/AIProvider";
import { withAIQuota, createQuotaAwareAIRequest } from "@/server/ai/QuotaMiddleware";

export const runtime = "nodejs";

type Body = { request?: unknown; provider?: AIProviderId; model?: string; models?: AIModelPreferences; mode?: AISelectionMode };
const RATE_LIMIT_RETRY_AFTER_SECONDS = 30;

async function generateReview(body: Body & { request: Parameters<typeof LabPromptBuilder.review>[0] }, signal: AbortSignal, userApiKeys?: Partial<Record<import("@/features/ai/AIProvider").AIProviderId, string>>) {
  const message = LabPromptBuilder.review(body.request);
  const primaryProvider = body.provider ?? "gemini";
  const primaryRequest = {
    history: [],
    message,
    provider: primaryProvider,
    model: body.model,
    models: body.models,
    mode: body.mode,
    signal,
    apiKeys: userApiKeys,
  } as const;

  return AIService.generate(primaryRequest);
}

export async function POST(request: Request) {
  return withAIQuota(request, async (request, aiRequest) => {
    const body = await request.json().catch(() => null) as Body | null;
    if (!body || !isLabReviewRequest(body.request) || (body.provider !== undefined && !isAIProviderId(body.provider)) ||
      (body.mode !== undefined && !isAISelectionMode(body.mode)) || !isAIModelPreferences(body.models) ||
      (body.model !== undefined && (typeof body.model !== "string" || !body.model.trim()))) {
    return NextResponse.json({ error: "Os dados da correção são inválidos." }, { status: 400 });
  }
  try {
    const response = await generateReview(body as Body & { request: Parameters<typeof LabPromptBuilder.review>[0] }, request.signal, aiRequest.apiKeys as Partial<Record<AIProviderId, string>> | undefined);
    return NextResponse.json(response);
  } catch (error) {
    const normalized = normalizeAIError(error, "Não foi possível corrigir o exercício.");
    const response = NextResponse.json(normalized.body, { status: normalized.status });
    if (normalized.status === 429) response.headers.set("Retry-After", String(RATE_LIMIT_RETRY_AFTER_SECONDS));
    return response;
  }
}, { history: [], message: "Corrigir exercício do laboratório." });
}
