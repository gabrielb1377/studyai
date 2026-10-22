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

type FlashcardRequest = { studyId: string; title: string; subject: string; chunks: RetrievedChunk[]; model?: string; models?: AIModelPreferences; mode?: AISelectionMode; provider?: AIProviderId };
type GeneratedFlashcard = { question: string; answer: string; difficulty: "easy" | "medium" | "hard" };

function isRequest(value: unknown): value is FlashcardRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<FlashcardRequest>;
  return typeof request.studyId === "string" && typeof request.title === "string" && typeof request.subject === "string" &&
    (request.provider === undefined || isAIProviderId(request.provider)) &&
    (request.model === undefined || (typeof request.model === "string" && request.model.trim().length > 0)) &&
    isAIModelPreferences(request.models) &&
    (request.mode === undefined || isAISelectionMode(request.mode)) &&
    Boolean(request.studyId.trim() && request.title.trim() && request.subject.trim()) &&
    Array.isArray(request.chunks) && request.chunks.length > 0 && request.chunks.length <= 20 &&
    request.chunks.every((chunk) => isRetrievedChunk(chunk) && chunk.studyId === request.studyId);
}

function parseCards(value: string): GeneratedFlashcard[] | null {
  try {
    const cards: unknown = JSON.parse(value.replace(/^```json\s*|\s*```$/g, "").trim());
    return Array.isArray(cards) && cards.length > 0 && cards.every((card) =>
      Boolean(card) && typeof card.question === "string" && typeof card.answer === "string" &&
      (card.difficulty === "easy" || card.difficulty === "medium" || card.difficulty === "hard"),
    ) ? cards.slice(0, 8) as GeneratedFlashcard[] : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
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
      const cards = parseCards(response.text);
      if (!cards) return NextResponse.json({ error: "O provider não retornou flashcards em um formato válido." }, { status: 502 });
      return NextResponse.json({ cards });
    } catch (error) {
      const normalized = normalizeAIError(error, "Erro inesperado ao criar flashcards.");
      return NextResponse.json(normalized.body, { status: normalized.status });
    }
  });
}
