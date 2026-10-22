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
import type { RetrievedChunk } from "@/features/retrieval/RetrievalTypes";
import type { TutorMessage } from "@/types/tutor";
import type { TutorStudyContext } from "@/types/tutor-context";
import { isTutorStudyContext } from "@/features/tutor/utils/tutor-context-validation";
import { withAIQuota, createQuotaAwareAIRequest } from "@/server/ai/QuotaMiddleware";

export const runtime = "nodejs";

type SummaryRequest = {
  history: Array<Pick<TutorMessage, "content" | "role">>;
  context: TutorStudyContext;
  chunks: RetrievedChunk[];
  model?: string;
  models?: AIModelPreferences;
  mode?: AISelectionMode;
  provider?: AIProviderId;
};

function isSummaryRequest(value: unknown): value is SummaryRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<SummaryRequest>;
  return Array.isArray(request.history) && request.history.every((message) =>
    Boolean(message) && (message.role === "assistant" || message.role === "user") && typeof message.content === "string",
  ) && (request.provider === undefined || isAIProviderId(request.provider)) &&
    (request.model === undefined || (typeof request.model === "string" && request.model.trim().length > 0)) &&
    isAIModelPreferences(request.models) &&
    (request.mode === undefined || isAISelectionMode(request.mode)) &&
    isTutorStudyContext(request.context) &&
    Array.isArray(request.chunks) && request.chunks.length > 0 && request.chunks.length <= 20 &&
    request.chunks.every((chunk) => Boolean(chunk) && typeof chunk.text === "string" && chunk.text.length <= 8_000 && chunk.studyId === request.context?.studyId);
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
      return NextResponse.json(response);
    } catch (error) {
      const normalized = normalizeAIError(error, "Erro inesperado ao gerar o resumo.");
      return NextResponse.json(normalized.body, { status: normalized.status });
    }
  });
}
