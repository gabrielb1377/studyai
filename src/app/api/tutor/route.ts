import { NextResponse } from "next/server";
import {
  GeminiService,
  GeminiServiceError,
} from "@/features/tutor/services/GeminiService";
import type { TutorMessage } from "@/types/tutor";
import type { TutorStudyContext } from "@/types/tutor-context";
import type { RetrievedChunk } from "@/features/retrieval/RetrievalTypes";
import { PromptBuilder } from "@/features/tutor/services/PromptBuilder";

export const runtime = "nodejs";

type TutorRequest = {
  history: Array<Pick<TutorMessage, "content" | "role">>;
  message: string;
  context?: TutorStudyContext;
  chunks?: RetrievedChunk[];
};

function isRetrievedChunk(value: unknown): value is RetrievedChunk {
  if (typeof value !== "object" || value === null) return false;
  const chunk = value as Partial<RetrievedChunk>;
  return typeof chunk.id === "string" && typeof chunk.studyId === "string" &&
    typeof chunk.fileId === "string" && Number.isInteger(chunk.chunkIndex) &&
    typeof chunk.text === "string" && chunk.text.length <= 8_000 &&
    typeof chunk.score === "number" && Number.isFinite(chunk.score) &&
    Array.isArray(chunk.matchedTerms) && chunk.matchedTerms.every((term) => typeof term === "string") &&
    typeof chunk.metadata === "object" && chunk.metadata !== null &&
    typeof chunk.metadata.extractedContentId === "string" &&
    typeof chunk.metadata.sourceName === "string" &&
    typeof chunk.metadata.fileType === "string" &&
    typeof chunk.metadata.mimeType === "string" &&
    typeof chunk.metadata.size === "number";
}

function isTutorContext(value: unknown): value is TutorStudyContext {
  if (typeof value !== "object" || value === null) return false;
  const context = value as Partial<TutorStudyContext>;
  return typeof context.studyId === "string" && typeof context.title === "string" &&
    typeof context.subject === "string" && typeof context.topic === "string" &&
    typeof context.progress === "number" &&
    (context.status === "not_started" || context.status === "in_progress" || context.status === "completed") &&
    Array.isArray(context.notes) && context.notes.every((note) =>
      typeof note === "object" && note !== null && typeof note.title === "string" && typeof note.content === "string",
    ) && (context.summary === undefined || (
      typeof context.summary === "object" && context.summary !== null &&
      typeof context.summary.title === "string" && typeof context.summary.content === "string"
    ));
}

function isTutorRequest(value: unknown): value is TutorRequest {
  if (typeof value !== "object" || value === null) return false;
  const request = value as Partial<TutorRequest>;
  return typeof request.message === "string" && request.message.trim().length > 0 &&
    (request.context === undefined || isTutorContext(request.context)) &&
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
    const prompt = PromptBuilder.build({
      question: body.message,
      history: body.history,
      studyContext: body.context,
      chunks: body.chunks,
    });
    const response = await GeminiService.generateReply({
      history: prompt.history,
      message: prompt.message,
      signal: request.signal,
    });
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof GeminiServiceError) {
      return NextResponse.json(
        { code: error.code, error: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { code: "UNKNOWN_ERROR", error: "Erro inesperado ao consultar o Tutor IA." },
      { status: 500 },
    );
  }
}
