import { NextResponse } from "next/server";
import {
  GeminiService,
  GeminiServiceError,
} from "@/features/tutor/services/GeminiService";
import type { TutorMessage } from "@/types/tutor";
import type { TutorStudyContext } from "@/types/tutor-context";
import { PromptBuilder } from "@/features/tutor/services/PromptBuilder";

export const runtime = "nodejs";

type TutorRequest = {
  history: Array<Pick<TutorMessage, "content" | "role">>;
  message: string;
  context?: TutorStudyContext;
};

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
    const response = await GeminiService.generateReply({
      history: body.history,
      message: PromptBuilder.build(body.message, body.context),
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
