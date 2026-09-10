import { NextResponse } from "next/server";
import { GeminiService, GeminiServiceError } from "@/features/tutor/services/GeminiService";

export const runtime = "nodejs";

type FlashcardRequest = { studyId: string; title: string; subject: string };
type GeneratedFlashcard = { question: string; answer: string; difficulty: "easy" | "medium" | "hard" };

function isRequest(value: unknown): value is FlashcardRequest {
  if (typeof value !== "object" || value === null) return false;
  const request = value as Partial<FlashcardRequest>;
  return typeof request.studyId === "string" && typeof request.title === "string" && typeof request.subject === "string" && Boolean(request.studyId.trim() && request.title.trim() && request.subject.trim());
}

function parseCards(value: string): GeneratedFlashcard[] | null {
  const json = value.replace(/^```json\s*|\s*```$/g, "").trim();
  try {
    const cards: unknown = JSON.parse(json);
    return Array.isArray(cards) && cards.length > 0 && cards.every((card) => typeof card === "object" && card !== null && typeof card.question === "string" && typeof card.answer === "string" && (card.difficulty === "easy" || card.difficulty === "medium" || card.difficulty === "hard")) ? cards.slice(0, 8) as GeneratedFlashcard[] : null;
  } catch { return null; }
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  if (!isRequest(body)) return NextResponse.json({ error: "Tema inválido para criar flashcards." }, { status: 400 });
  try {
    const response = await GeminiService.generateReply({ history: [], signal: request.signal, message: `Crie 5 flashcards curtos em português para o tema "${body.title}" da matéria "${body.subject}". Responda somente com um array JSON válido. Cada item deve ter question, answer e difficulty, sendo difficulty apenas easy, medium ou hard. Não inclua markdown nem explicações.` });
    const cards = parseCards(response.text);
    if (!cards) return NextResponse.json({ error: "O Gemini não retornou flashcards em um formato válido." }, { status: 502 });
    return NextResponse.json({ cards });
  } catch (error) {
    if (error instanceof GeminiServiceError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Erro inesperado ao criar flashcards." }, { status: 500 });
  }
}
