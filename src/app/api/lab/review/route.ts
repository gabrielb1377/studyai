import { NextResponse } from "next/server";
import { normalizeAIError } from "@/features/ai/AIErrors";
import { AIService } from "@/features/ai/AIService";
import { LabPromptBuilder } from "@/features/lab/services/LabPromptBuilder";
import { isLabReviewRequest } from "@/features/lab/validators/lab-validation";
import { isAIModelPreferences, isAIProviderId, isAISelectionMode, type AIModelPreferences, type AIProviderId, type AISelectionMode } from "@/features/ai/AIProvider";

export const runtime = "nodejs";

type Body = { request?: unknown; provider?: AIProviderId; model?: string; models?: AIModelPreferences; mode?: AISelectionMode };

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Body | null;
  if (!body || !isLabReviewRequest(body.request) || (body.provider !== undefined && !isAIProviderId(body.provider)) ||
    (body.mode !== undefined && !isAISelectionMode(body.mode)) || !isAIModelPreferences(body.models) ||
    (body.model !== undefined && (typeof body.model !== "string" || !body.model.trim()))) {
    return NextResponse.json({ error: "Os dados da correção são inválidos." }, { status: 400 });
  }
  try {
    const response = await AIService.generate({
      history: [],
      message: LabPromptBuilder.review(body.request),
      provider: body.provider,
      model: body.model,
      models: body.models,
      mode: body.mode,
      signal: request.signal,
    });
    return NextResponse.json(response);
  } catch (error) {
    const normalized = normalizeAIError(error, "Não foi possível corrigir o exercício.");
    return NextResponse.json(normalized.body, { status: normalized.status });
  }
}
