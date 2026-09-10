import { NextResponse } from "next/server";
import {
  GeminiService,
  GeminiServiceError,
} from "@/features/tutor/services/GeminiService";
import type { TutorMessage } from "@/types/tutor";

export const runtime = "nodejs";

type SummaryRequest = {
  history: Array<Pick<TutorMessage, "content" | "role">>;
};

function isSummaryRequest(value: unknown): value is SummaryRequest {
  if (typeof value !== "object" || value === null) return false;
  const request = value as Partial<SummaryRequest>;
  return Array.isArray(request.history) && request.history.length > 0 &&
    request.history.every((message) =>
      typeof message === "object" && message !== null &&
      (message.role === "assistant" || message.role === "user") &&
      typeof message.content === "string",
    );
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  if (!isSummaryRequest(body)) {
    return NextResponse.json(
      { code: "INVALID_REQUEST", error: "Histórico inválido para gerar o resumo." },
      { status: 400 },
    );
  }

  try {
    const response = await GeminiService.generateReply({
      history: body.history,
      message: "Gere um resumo fiel, claro e organizado desta conversa de estudo. Use títulos curtos e tópicos quando ajudarem a revisão. Não invente informações que não estejam presentes na conversa.",
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
