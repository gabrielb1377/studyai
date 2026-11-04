import { NextResponse } from "next/server";
import { apiError, requireCsrf, requireSessionOwner, requireUser } from "@/server/auth/http";
import { hasPostgres } from "@/server/database/Postgres";
import { ExamAttemptServer, parseGeneratedQuestions } from "@/server/exam/ExamAttemptServer";
import { AIService } from "@/features/ai/AIService";
import { PromptBuilder } from "@/features/ai/PromptBuilder";
import { withAIQuota } from "@/server/ai/QuotaMiddleware";
import { isRetrievedChunk } from "@/features/retrieval/retrieval-validation";
import type { RetrievedChunk } from "@/features/retrieval/RetrievalTypes";

export const runtime = "nodejs";

const QUESTION_COUNTS = new Set([5, 10, 20]);
const DIFFICULTIES = new Set(["easy", "medium", "hard"]);

type SecureAttemptPayload = {
  studyId: string;
  title: string;
  subject: string;
  chunks: RetrievedChunk[];
  count: 5 | 10 | 20;
  difficulty: "easy" | "medium" | "hard";
};

function isSecureAttemptPayload(value: unknown): value is SecureAttemptPayload {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<SecureAttemptPayload> & { questions?: unknown };
  if ("questions" in body) return false;
  return typeof body.studyId === "string" && Boolean(body.studyId.trim()) &&
    typeof body.title === "string" && Boolean(body.title.trim()) &&
    typeof body.subject === "string" && Boolean(body.subject.trim()) &&
    typeof body.count === "number" && QUESTION_COUNTS.has(body.count) &&
    typeof body.difficulty === "string" && DIFFICULTIES.has(body.difficulty) &&
    Array.isArray(body.chunks) && body.chunks.length > 0 && body.chunks.length <= 20 &&
    body.chunks.every((chunk) => isRetrievedChunk(chunk) && chunk.studyId === body.studyId);
}

/**
 * Cria uma tentativa protegida. As questões são geradas e validadas no
 * servidor; o navegador envia apenas contexto e configuração, nunca o
 * gabarito. A resposta inicial contém somente questões sanitizadas.
 */
export async function POST(request: Request) {
  try {
    requireCsrf(request);
    const user = requireUser(request);
    requireSessionOwner(request, user.sub);

    const body: unknown = await request.clone().json().catch(() => null);
    if (!isSecureAttemptPayload(body)) {
      return NextResponse.json({ error: "EXAM_PAYLOAD_INVALID" }, { status: 400 });
    }

    // Não gastar chamada de IA quando a persistência obrigatória está ausente.
    if (!hasPostgres()) {
      return NextResponse.json({ error: "POSTGRES_UNAVAILABLE" }, { status: 503 });
    }

    const payload = body;
    return await withAIQuota(
      request,
      async (aiRequestSource, aiRequest) => {
        const generated = await AIService.generate({ ...aiRequest, signal: aiRequestSource.signal });
        const questions = parseGeneratedQuestions(generated.text, payload.count);
        const attempt = await ExamAttemptServer.create(user.sub, { title: payload.title, questions });
        return NextResponse.json(attempt);
      },
      {
        history: [],
        message: PromptBuilder.examQuiz(payload.title, payload.subject, payload.chunks, payload.count, payload.difficulty),
      },
    );
  } catch (error) {
    return apiError(error);
  }
}

/** Retomada: devolve a tentativa do próprio usuário sem expor o gabarito. */
export async function GET(request: Request) {
  try {
    const user = requireUser(request);
    requireSessionOwner(request, user.sub);
    const attemptId = new URL(request.url).searchParams.get("id");
    const attempt = await ExamAttemptServer.get(user.sub, attemptId);
    return NextResponse.json(attempt);
  } catch (error) {
    return apiError(error);
  }
}
