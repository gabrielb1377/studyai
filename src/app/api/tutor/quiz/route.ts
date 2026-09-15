import { NextResponse } from "next/server";

import { AIService } from "@/features/ai/AIService";
import { normalizeAIError } from "@/features/ai/AIErrors";
import { isAIProviderId, type AIProviderId } from "@/features/ai/AIProvider";
import { PromptBuilder } from "@/features/ai/PromptBuilder";
import { isRetrievedChunk } from "@/features/retrieval/retrieval-validation";
import type { RetrievedChunk } from "@/features/retrieval/RetrievalTypes";

export const runtime = "nodejs";

type QuizRequest = { studyId: string; title: string; subject: string; chunks: RetrievedChunk[]; provider?: AIProviderId };
type GeneratedQuestion = { question: string; alternatives: string[]; correctAnswer: number; explanation: string; difficulty: "easy" | "medium" | "hard" };

function isRequest(value: unknown): value is QuizRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<QuizRequest>;
  return typeof request.studyId === "string" && typeof request.title === "string" && typeof request.subject === "string" &&
    (request.provider === undefined || isAIProviderId(request.provider)) &&
    Boolean(request.studyId.trim() && request.title.trim() && request.subject.trim()) &&
    Array.isArray(request.chunks) && request.chunks.length > 0 && request.chunks.length <= 20 &&
    request.chunks.every((chunk) => isRetrievedChunk(chunk) && chunk.studyId === request.studyId);
}

function parseQuestions(value: string): GeneratedQuestion[] | null {
  try {
    const parsed: unknown = JSON.parse(value.replace(/^```json\s*|\s*```$/g, "").trim());
    return Array.isArray(parsed) && parsed.length >= 5 && parsed.length <= 10 && parsed.every((item) =>
      Boolean(item) && typeof item.question === "string" && Array.isArray(item.alternatives) && item.alternatives.length === 4 &&
      item.alternatives.every((alternative: unknown) => typeof alternative === "string") &&
      typeof item.correctAnswer === "number" && item.correctAnswer >= 0 && item.correctAnswer < 4 &&
      typeof item.explanation === "string" && (item.difficulty === "easy" || item.difficulty === "medium" || item.difficulty === "hard"),
    ) ? parsed as GeneratedQuestion[] : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  if (!isRequest(body)) {
    return NextResponse.json({ error: "É necessário conteúdo real extraído para criar o quiz." }, { status: 400 });
  }

  try {
    const response = await AIService.generate({
      history: [],
      signal: request.signal,
      message: PromptBuilder.quiz(body.title, body.subject, body.chunks),
      provider: body.provider,
    });
    const questions = parseQuestions(response.text);
    if (!questions) return NextResponse.json({ error: "O provider não retornou questões em um formato válido." }, { status: 502 });
    return NextResponse.json({ questions });
  } catch (error) {
    const normalized = normalizeAIError(error, "Erro inesperado ao criar o quiz.");
    return NextResponse.json(normalized.body, { status: normalized.status });
  }
}
