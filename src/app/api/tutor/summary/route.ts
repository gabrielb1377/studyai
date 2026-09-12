import { NextResponse } from "next/server";

import type { RetrievedChunk } from "@/features/retrieval/RetrievalTypes";
import {
  GeminiService,
  GeminiServiceError,
} from "@/features/tutor/services/GeminiService";
import { PromptBuilder } from "@/features/tutor/services/PromptBuilder";
import type { TutorMessage } from "@/types/tutor";
import type { TutorStudyContext } from "@/types/tutor-context";

export const runtime = "nodejs";

type SummaryRequest = {
  history: Array<Pick<TutorMessage, "content" | "role">>;
  context: TutorStudyContext;
  chunks: RetrievedChunk[];
};

function isSummaryRequest(value: unknown): value is SummaryRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<SummaryRequest>;
  return Array.isArray(request.history) && request.history.every((message) =>
    Boolean(message) && (message.role === "assistant" || message.role === "user") && typeof message.content === "string",
  ) && Boolean(request.context) && typeof request.context?.studyId === "string" &&
    Array.isArray(request.chunks) && request.chunks.length > 0 && request.chunks.length <= 20 &&
    request.chunks.every((chunk) => Boolean(chunk) && typeof chunk.text === "string" && chunk.text.length <= 8_000 && chunk.studyId === request.context?.studyId);
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  if (!isSummaryRequest(body)) {
    return NextResponse.json(
      { code: "INVALID_REQUEST", error: "É necessário um estudo com conteúdo real extraído para gerar o resumo." },
      { status: 400 },
    );
  }

  try {
    const prompt = PromptBuilder.build({
      question: "Gere um resumo fiel, claro e organizado apenas a partir dos materiais recuperados. Use títulos curtos e tópicos quando ajudarem a revisão. Não invente informações ausentes.",
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
      return NextResponse.json({ code: error.code, error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { code: "UNKNOWN_ERROR", error: "Erro inesperado ao gerar o resumo." },
      { status: 500 },
    );
  }
}
