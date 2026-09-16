import { NextResponse } from "next/server";
import { AIService } from "@/features/ai/AIService";
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
import type { TutorMessage } from "@/types/tutor";
import type { TutorStudyContext } from "@/types/tutor-context";
import type { RetrievedChunk } from "@/features/retrieval/RetrievalTypes";
import { isTutorStudyContext } from "@/features/tutor/utils/tutor-context-validation";

export const runtime = "nodejs";

type TutorRequest = {
  history: Array<Pick<TutorMessage, "content" | "role">>;
  message: string;
  context?: TutorStudyContext;
  chunks?: RetrievedChunk[];
  model?: string;
  models?: AIModelPreferences;
  mode?: AISelectionMode;
  provider?: AIProviderId;
  stream?: boolean;
};

function isTutorRequest(value: unknown): value is TutorRequest {
  if (typeof value !== "object" || value === null) return false;
  const request = value as Partial<TutorRequest>;
  return typeof request.message === "string" && request.message.trim().length > 0 &&
    (request.model === undefined || (typeof request.model === "string" && request.model.trim().length > 0)) &&
    isAIModelPreferences(request.models) &&
    (request.mode === undefined || isAISelectionMode(request.mode)) &&
    (request.provider === undefined || isAIProviderId(request.provider)) &&
    (request.stream === undefined || typeof request.stream === "boolean") &&
    (request.context === undefined || isTutorStudyContext(request.context)) &&
    (request.chunks === undefined || (
      Array.isArray(request.chunks) && request.chunks.length <= 10 &&
      request.chunks.every(isRetrievedChunk)
    )) &&
    Array.isArray(request.history) && request.history.every((message) =>
      typeof message === "object" && message !== null &&
      (message.role === "assistant" || message.role === "user") &&
      typeof message.content === "string",
    );
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  if (!isTutorRequest(body)) {
    return NextResponse.json(
      { code: "INVALID_REQUEST", error: "Mensagem ou histórico inválido." },
      { status: 400 },
    );
  }

  try {
    const prompt = PromptBuilder.contextual({
      question: body.message,
      history: body.history,
      studyContext: body.context,
      chunks: body.chunks,
    });
    const response = await AIService.generate({
      history: prompt.history,
      message: prompt.message,
      model: body.model,
      models: body.models,
      mode: body.mode,
      signal: request.signal,
      provider: body.provider,
      stream: body.stream,
    });
    return NextResponse.json(response);
  } catch (error) {
    const normalized = normalizeAIError(error, "Erro inesperado ao consultar o Tutor IA.");
    return NextResponse.json(normalized.body, { status: normalized.status });
  }
}
