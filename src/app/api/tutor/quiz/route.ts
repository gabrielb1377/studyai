import { NextResponse } from "next/server";
import { AIService } from "@/features/ai/AIService";
import { ApiKeyService } from "@/server/ai/ApiKeyService";
import { requireUser } from "@/server/auth/http";
import { aiProviderIds } from "@/features/ai/AIProvider";
import { normalizeAIError } from "@/features/ai/AIErrors";
import {
  isAIModelPreferences,
  isAIProviderId,
  isAISelectionMode,
  type AIModelPreferences,
  type AIProviderId,
  type AISelectionMode,
} from "@/features/ai/AIProvider";
import { PromptBuilder } from "@/features/ai/PromptBuilder";
import { isRetrievedChunk } from "@/features/retrieval/retrieval-validation";
import type { RetrievedChunk } from "@/features/retrieval/RetrievalTypes";
import { withAIQuota, createQuotaAwareAIRequest } from "@/server/ai/QuotaMiddleware";

export const runtime = "nodejs";

type QuizRequest = { studyId: string; title: string; subject: string; chunks: RetrievedChunk[]; model?: string; models?: AIModelPreferences; mode?: AISelectionMode; provider?: AIProviderId };
type GeneratedQuestion = { question: string; alternatives: string[]; correctAnswer: number; explanation: string; difficulty: "easy" | "medium" | "hard" };

function isRequest(value: unknown): value is QuizRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<QuizRequest>;
  return typeof request.studyId === "string" && typeof request.title === "string" && typeof request.subject === "string" &&
    (request.provider === undefined || isAIProviderId(request.provider)) &&
    (request.model === undefined || (typeof request.model === "string" && request.model.trim().length > 0)) &&
    isAIModelPreferences(request.models) &&
    (request.mode === undefined || isAISelectionMode(request.mode)) &&
    Boolean(request.studyId.trim() && request.title.trim() && request.subject.trim()) &&
    Array.isArray(request.chunks) && request.chunks.length > 0 && request.chunks.length <= 20 &&
    request.chunks.every((chunk) => isRetrievedChunk(chunk) && chunk.studyId === request.studyId);
}

function parseQuestions(value: string): GeneratedQuestion[] | null {
  try {
    const parsed: unknown = JSON.parse(value.replace(/^```json\s*|\s*```$/g, "").trim());
    return Array.isArray(parsed) && parsed.length >= 5 && parsed.length <= 10 && parsed.every((item) =>
      Boolean(item) && typeof item.question === "string" && item.question.trim().length > 0 && Array.isArray(item.alternatives) && item.alternatives.length === 4 &&
      item.alternatives.every((alternative: unknown) => typeof alternative === "string" && alternative.trim().length > 0) &&
      Number.isInteger(item.correctAnswer) && item.correctAnswer >= 0 && item.correctAnswer < 4 &&
      typeof item.explanation === "string" && item.explanation.trim().length > 0 && (item.difficulty === "easy" || item.difficulty === "medium" || item.difficulty === "hard"),
    ) ? parsed as GeneratedQuestion[] : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const body: unknown = await request.clone().json().catch(() => null);
  if (!isRequest(body)) return NextResponse.json({ error: "Dados para criar quiz inválidos." }, { status: 400 });
  return withAIQuota(request, async (request, aiRequest) => {
    try {
      const response = await AIService.generate({
        history: aiRequest.history,
        message: aiRequest.message,
        model: aiRequest.model,
        models: aiRequest.models,
        mode: aiRequest.mode,
        signal: request.signal,
        provider: aiRequest.provider,
        apiKeys: aiRequest.apiKeys,
      });
      const questions = parseQuestions(response.text);
      if (!questions) return NextResponse.json({ error: "O provider não retornou questões em um formato válido." }, { status: 502 });
      return NextResponse.json({ questions, provider: response.provider, model: response.model });
    } catch (error) {
      const normalized = normalizeAIError(error, "Erro inesperado ao criar o quiz.");
      return NextResponse.json(normalized.body, { status: normalized.status });
    }
  }, { history: [], message: PromptBuilder.quiz(body.title, body.subject, body.chunks) });
}
