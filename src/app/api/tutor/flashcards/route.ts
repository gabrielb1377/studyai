import { NextResponse } from "next/server";

import { ContextAssembler } from "@/features/retrieval/ContextAssembler";
import { isRetrievedChunk } from "@/features/retrieval/retrieval-validation";
import type { RetrievedChunk } from "@/features/retrieval/RetrievalTypes";
import { GeminiService, GeminiServiceError } from "@/features/tutor/services/GeminiService";

export const runtime = "nodejs";

type FlashcardRequest = { studyId: string; title: string; subject: string; chunks: RetrievedChunk[] };
type GeneratedFlashcard = { question: string; answer: string; difficulty: "easy" | "medium" | "hard" };

function isRequest(value: unknown): value is FlashcardRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<FlashcardRequest>;
  return typeof request.studyId === "string" && typeof request.title === "string" && typeof request.subject === "string" &&
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
  const body: unknown = await request.json().catch(() => null);
  if (!isRequest(body)) {
    return NextResponse.json({ error: "É necessário conteúdo real extraído para criar flashcards." }, { status: 400 });
  }

  try {
    const source = ContextAssembler.assemble(body.chunks);
    const response = await GeminiService.generateReply({
      history: [],
      signal: request.signal,
      message: `Crie 5 flashcards curtos em português usando somente o conteúdo fornecido. Responda apenas com um array JSON válido, sem markdown. Cada item deve ter question, answer e difficulty (easy, medium ou hard).\n\nTema: ${body.title}\nMatéria: ${body.subject}\n\nConteúdo real extraído:\n${source}`,
    });
    const cards = parseCards(response.text);
    if (!cards) return NextResponse.json({ error: "O Gemini não retornou flashcards em um formato válido." }, { status: 502 });
    return NextResponse.json({ cards });
  } catch (error) {
    if (error instanceof GeminiServiceError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Erro inesperado ao criar flashcards." }, { status: 500 });
  }
}
