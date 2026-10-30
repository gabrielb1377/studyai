import { NextResponse } from "next/server";
import { AIService } from "@/features/ai/AIService";
import type { AIManagerRequest, AIProviderId } from "@/features/ai/AIProvider";

const ALLOWED_PROVIDERS: readonly AIProviderId[] = ["gemini", "ollama", "groq", "openrouter"];

interface JudgeApiRequest {
  prompt: string;
  provider: AIProviderId;
  model: string;
  apiKey?: string;
  maxTokens: number;
}

function validateProvider(provider: string): provider is AIProviderId {
  return ALLOWED_PROVIDERS.includes(provider as AIProviderId);
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as JudgeApiRequest;
    const { prompt, provider, model, apiKey, maxTokens } = body;

    if (!prompt || !provider || !model) {
      return NextResponse.json({ error: "Campos obrigatórios ausentes" }, { status: 400 });
    }
    if (!validateProvider(provider)) {
      return NextResponse.json({ error: "Provider inválido" }, { status: 400 });
    }

    const requestPayload: AIManagerRequest = {
      message: prompt,
      history: [],
      provider,
      model,
      apiKey,
      maxOutputTokens: maxTokens,
      mode: "manual",
    };

    const response = await AIService.generate(requestPayload);

    return NextResponse.json({
      text: response.text,
      provider: response.provider,
      model: response.model,
    });
  } catch (error) {
    console.error("AI Quality Judge error:", error);
    return NextResponse.json({ error: "Erro interno no judge" }, { status: 500 });
  }
}