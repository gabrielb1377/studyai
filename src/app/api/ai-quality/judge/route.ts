import { NextResponse } from "next/server";
import { AIService } from "@/features/ai/AIService";
import type { AIProviderId } from "@/features/ai/AIProvider";
import { apiError, jsonBody, requireCsrf, requireUser } from "@/server/auth/http";
import { withAIQuota } from "@/server/ai/QuotaMiddleware";

const ALLOWED_PROVIDERS: readonly AIProviderId[] = ["gemini", "ollama", "groq", "openrouter"];

interface JudgeApiRequest {
  prompt: string;
  provider: AIProviderId;
  model: string;
  maxTokens: number;
}

function validateProvider(provider: string): provider is AIProviderId {
  return ALLOWED_PROVIDERS.includes(provider as AIProviderId);
}

export async function POST(request: Request) {
  try {
    requireCsrf(request);
    requireUser(request);
    const body = await jsonBody<JudgeApiRequest>(request.clone(), 32 * 1024);
    const { prompt, provider, model, maxTokens } = body;

    if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 20_000 || typeof model !== "string" || !model.trim() || model.length > 200) {
      return NextResponse.json({ error: "Campos obrigatórios ausentes" }, { status: 400 });
    }
    if (!validateProvider(provider)) {
      return NextResponse.json({ error: "Provider inválido" }, { status: 400 });
    }
    if (!Number.isInteger(maxTokens) || maxTokens < 100 || maxTokens > 4_000) {
      return NextResponse.json({ error: "Limite de tokens inválido" }, { status: 400 });
    }

    return withAIQuota(
      request,
      async (_request, aiRequest) => {
        const response = await AIService.generate({ ...aiRequest, maxOutputTokens: maxTokens });
        return NextResponse.json({ text: response.text, provider: response.provider, model: response.model });
      },
      { history: [], message: prompt },
    );
  } catch (error) {
    return apiError(error);
  }
}
