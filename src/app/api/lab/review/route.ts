import { NextResponse } from "next/server";
import { isAIRateLimitError, normalizeAIError } from "@/features/ai/AIErrors";
import { AIService } from "@/features/ai/AIService";
import { LabPromptBuilder } from "@/features/lab/services/LabPromptBuilder";
import { isLabReviewRequest } from "@/features/lab/validators/lab-validation";
import { isAIModelPreferences, isAIProviderId, isAISelectionMode, type AIModelPreferences, type AIProviderId, type AISelectionMode } from "@/features/ai/AIProvider";
import { Telemetry } from "@/server/observability/Telemetry";

export const runtime = "nodejs";

type Body = { request?: unknown; provider?: AIProviderId; model?: string; models?: AIModelPreferences; mode?: AISelectionMode };
const RATE_LIMIT_RETRY_AFTER_SECONDS = 30;

async function generateReview(body: Body & { request: Parameters<typeof LabPromptBuilder.review>[0] }, signal: AbortSignal) {
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
  } as const;

  try {
    return await AIService.generate(primaryRequest);
  } catch (error) {
    if (!isAIRateLimitError(error) || body.mode === "automatic") throw error;
    Telemetry.metric({ name: "lab-ai-rate-limit", value: 1, unit: "count", source: "server" });
    const status = await AIService.status({ force: true, signal });
    const fallback = status.providers
      .filter((provider) => provider.provider !== primaryProvider && provider.available && provider.models.length > 0)
      .sort((left, right) => left.latencyMs - right.latencyMs)[0];
    if (!fallback) throw error;

    try {
      const response = await AIService.generate({
        ...primaryRequest,
        provider: fallback.provider,
        model: body.models?.[fallback.provider],
        mode: "manual",
      });
      Telemetry.metric({ name: "lab-ai-fallback-success", value: 1, unit: "count", source: "server" });
      return response;
    } catch (fallbackError) {
      Telemetry.metric({ name: "lab-ai-fallback-failure", value: 1, unit: "count", source: "server" });
      throw fallbackError;
    }
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Body | null;
  if (!body || !isLabReviewRequest(body.request) || (body.provider !== undefined && !isAIProviderId(body.provider)) ||
    (body.mode !== undefined && !isAISelectionMode(body.mode)) || !isAIModelPreferences(body.models) ||
    (body.model !== undefined && (typeof body.model !== "string" || !body.model.trim()))) {
    return NextResponse.json({ error: "Os dados da correção são inválidos." }, { status: 400 });
  }
  try {
    const response = await generateReview(body as Body & { request: Parameters<typeof LabPromptBuilder.review>[0] }, request.signal);
    return NextResponse.json(response);
  } catch (error) {
    const normalized = normalizeAIError(error, "Não foi possível corrigir o exercício.");
    const response = NextResponse.json(normalized.body, { status: normalized.status });
    if (normalized.status === 429) response.headers.set("Retry-After", String(RATE_LIMIT_RETRY_AFTER_SECONDS));
    return response;
  }
}
