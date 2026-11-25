import "server-only";
import { randomUUID } from "node:crypto";
import { hasPostgres, query, transaction } from "@/server/database/Postgres";
import type { ExamAttemptRecord, ExamAttemptResult, ExamAttemptStatus, SecureQuestion } from "@/types/exam";

const MAX_QUESTIONS = 200;
const MIN_ALTERNATIVES = 4;
const MAX_ALTERNATIVES = 5;
const MAX_TITLE_LENGTH = 200;
const MAX_QUESTION_LENGTH = 4_000;
const MAX_ALTERNATIVE_LENGTH = 1_000;
const MAX_EXPLANATION_LENGTH = 4_000;
const DIFFICULTIES = new Set(["easy", "medium", "hard"]);

export type ExamQuestionDifficulty = "easy" | "medium" | "hard";

/**
 * Questão completa armazenada apenas no servidor. `correctAnswer` e
 * `explanation` nunca são serializados para o cliente antes da entrega.
 */
export type StoredExamQuestion = {
  id: string;
  question: string;
  alternatives: string[];
  correctAnswer: number;
  explanation: string;
  difficulty?: ExamQuestionDifficulty;
};

type AttemptRow = {
  id: string;
  user_id: string;
  status: ExamAttemptStatus;
  title: string | null;
  questions: StoredExamQuestion[];
  answers: number[] | null;
  score: string | number | null;
  correct_count: number | null;
  total_count: number;
  created_at: Date | string;
  updated_at: Date | string;
  completed_at: Date | string | null;
};

function fail(status: number, code: string): Response {
  return new Response(JSON.stringify({ error: code }), { status, headers: { "content-type": "application/json" } });
}

function reject(status: number, code: string): never {
  throw fail(status, code);
}

/**
 * Provas protegidas não têm fallback em memória: sem PostgreSQL a operação
 * falha de forma controlada (503) em vez de persistir em runtime volátil.
 */
function requirePostgres() {
  if (!hasPostgres()) reject(503, "POSTGRES_UNAVAILABLE");
}

function iso(value: Date | string) {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function parseTitle(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") reject(400, "EXAM_TITLE_INVALID");
  const title = value.trim();
  if (!title) return undefined;
  if (title.length > MAX_TITLE_LENGTH) reject(400, "EXAM_TITLE_INVALID");
  return title;
}

function normalized(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeQuestions(
  value: unknown,
  options: { expectedCount?: number; status?: number } = {},
): StoredExamQuestion[] {
  const invalidStatus = options.status ?? 400;
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_QUESTIONS) {
    reject(invalidStatus, "EXAM_QUESTIONS_INVALID");
  }
  if (options.expectedCount !== undefined && value.length !== options.expectedCount) {
    reject(invalidStatus, "EXAM_QUESTION_COUNT_INVALID");
  }

  const seenIds = new Set<string>();
  const seenQuestions = new Set<string>();

  return value.map((item, index) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      reject(invalidStatus, "EXAM_QUESTIONS_INVALID");
    }
    const raw = item as Record<string, unknown>;
    const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim().slice(0, 120) : `q-${index + 1}`;
    if (seenIds.has(id)) reject(invalidStatus, "EXAM_QUESTION_ID_DUPLICATED");
    seenIds.add(id);

    const question = typeof raw.question === "string" ? raw.question.trim() : "";
    if (!question || question.length > MAX_QUESTION_LENGTH) reject(invalidStatus, "EXAM_QUESTION_TEXT_INVALID");
    const questionKey = normalized(question);
    if (seenQuestions.has(questionKey)) reject(invalidStatus, "EXAM_QUESTION_DUPLICATED");
    seenQuestions.add(questionKey);

    if (!Array.isArray(raw.alternatives) || raw.alternatives.length < MIN_ALTERNATIVES || raw.alternatives.length > MAX_ALTERNATIVES) {
      reject(invalidStatus, "EXAM_ALTERNATIVES_INVALID");
    }
    const alternatives = raw.alternatives.map((alternative) => (typeof alternative === "string" ? alternative.trim() : ""));
    if (alternatives.some((alternative) => !alternative || alternative.length > MAX_ALTERNATIVE_LENGTH)) {
      reject(invalidStatus, "EXAM_ALTERNATIVES_INVALID");
    }
    if (new Set(alternatives.map(normalized)).size !== alternatives.length) {
      reject(invalidStatus, "EXAM_ALTERNATIVES_DUPLICATED");
    }

    const correctAnswer = raw.correctAnswer;
    if (typeof correctAnswer !== "number" || !Number.isInteger(correctAnswer) || correctAnswer < 0 || correctAnswer >= alternatives.length) {
      reject(invalidStatus, "EXAM_CORRECT_ANSWER_INVALID");
    }

    const explanation = typeof raw.explanation === "string" ? raw.explanation.trim() : "";
    if (!explanation || explanation.length > MAX_EXPLANATION_LENGTH) reject(invalidStatus, "EXAM_EXPLANATION_INVALID");

    if (raw.difficulty !== undefined && (typeof raw.difficulty !== "string" || !DIFFICULTIES.has(raw.difficulty))) {
      reject(invalidStatus, "EXAM_DIFFICULTY_INVALID");
    }

    return {
      id,
      question,
      alternatives,
      correctAnswer,
      explanation,
      ...(typeof raw.difficulty === "string" ? { difficulty: raw.difficulty as ExamQuestionDifficulty } : {}),
    };
  });
}

/**
 * Converte a resposta textual do provider em questões validadas. O conteúdo
 * inválido nunca chega ao banco e o texto original não é devolvido no erro.
 */
export function parseGeneratedQuestions(text: string, expectedCount: number): StoredExamQuestion[] {
  if (!Number.isInteger(expectedCount) || expectedCount < 1 || expectedCount > MAX_QUESTIONS) {
    reject(400, "EXAM_QUESTION_COUNT_INVALID");
  }

  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start < 0 || end <= start) reject(502, "EXAM_GENERATION_INVALID");
    try {
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      reject(502, "EXAM_GENERATION_INVALID");
    }
  }

  if (!Array.isArray(parsed) || parsed.length === 0) reject(422, "EXAM_CONTENT_INSUFFICIENT");
  return normalizeQuestions(parsed, { expectedCount, status: 502 });
}

function sanitize(questions: readonly StoredExamQuestion[]): SecureQuestion[] {
  return questions.map(({ id, question, alternatives, difficulty }) => ({
    id,
    question,
    alternatives,
    ...(difficulty ? { difficulty } : {}),
  }));
}

function buildResult(row: AttemptRow): ExamAttemptResult {
  return {
    attemptId: row.id,
    status: "completed",
    score: Number(row.score ?? 0),
    correctCount: Number(row.correct_count ?? 0),
    totalCount: row.questions.length,
    answers: Array.isArray(row.answers) ? row.answers : [],
    questions: row.questions.map((question) => ({ ...question })),
    completedAt: iso(row.completed_at ?? row.updated_at),
  };
}

function toRecord(row: AttemptRow, includeResult = false): ExamAttemptRecord {
  const record: ExamAttemptRecord = {
    attemptId: row.id,
    status: row.status,
    title: row.title ?? undefined,
    questions: sanitize(row.questions),
    totalCount: row.questions.length,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    completedAt: row.completed_at ? iso(row.completed_at) : undefined,
  };
  return includeResult && row.status === "completed" ? { ...record, result: buildResult(row) } : record;
}

function parseAnswers(value: unknown, questions: readonly StoredExamQuestion[]): number[] {
  if (!Array.isArray(value) || value.length !== questions.length) reject(400, "EXAM_ANSWERS_INVALID");
  return value.map((item, index) => {
    if (item === null || item === undefined) return -1;
    const limit = questions[index]?.alternatives.length ?? 0;
    if (typeof item !== "number" || !Number.isInteger(item) || item < -1 || item >= limit) {
      reject(400, "EXAM_ANSWERS_INVALID");
    }
    return item;
  });
}

export const ExamAttemptServer = {
  /**
   * Cria a tentativa e persiste o gabarito. O chamador deve passar questões
   * geradas/validadas no servidor; a rota pública não aceita `questions` do
   * navegador. A resposta contém somente questões sanitizadas.
   */
  async create(userId: string, input: { title?: unknown; questions?: unknown }): Promise<ExamAttemptRecord> {
    requirePostgres();
    if (typeof userId !== "string" || !userId) reject(401, "AUTH_REQUIRED");
    const title = parseTitle(input.title);
    const questions = normalizeQuestions(input.questions);
    const id = randomUUID();
    const timestamp = new Date().toISOString();
    await query(
      "INSERT INTO exam_attempts (id,user_id,status,title,questions,total_count,created_at,updated_at) VALUES ($1,$2,'created',$3,$4,$5,$6,$6)",
      [id, userId, title ?? null, JSON.stringify(questions), questions.length, timestamp],
    );
    return {
      attemptId: id,
      status: "created",
      title,
      questions: sanitize(questions),
      totalCount: questions.length,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  },

  /** Recupera a tentativa do próprio usuário para retomada, sem gabarito. */
  async get(userId: string, attemptId: unknown): Promise<ExamAttemptRecord> {
    requirePostgres();
    if (typeof userId !== "string" || !userId) reject(401, "AUTH_REQUIRED");
    if (typeof attemptId !== "string" || !attemptId) reject(400, "ATTEMPT_ID_INVALID");
    const result = await query<AttemptRow>("SELECT * FROM exam_attempts WHERE id=$1 AND user_id=$2", [attemptId, userId]);
    const row = result.rows[0];
    if (!row) reject(404, "ATTEMPT_NOT_FOUND");
    return toRecord(row, row.status === "completed");
  },

  /**
   * Corrige a entrega usando o gabarito armazenado no servidor. A finalização
   * é transacional e idempotente: `FOR UPDATE` serializa submissões
   * simultâneas e uma tentativa concluída devolve sempre o mesmo resultado.
   */
  async grade(userId: string, attemptId: unknown, answers: unknown): Promise<ExamAttemptResult> {
    requirePostgres();
    if (typeof userId !== "string" || !userId) reject(401, "AUTH_REQUIRED");
    if (typeof attemptId !== "string" || !attemptId) reject(400, "ATTEMPT_ID_INVALID");
    return await transaction(async (client) => {
      const current = await client.query<AttemptRow>(
        "SELECT * FROM exam_attempts WHERE id=$1 AND user_id=$2 FOR UPDATE",
        [attemptId, userId],
      );
      const row = current.rows[0];
      if (!row) reject(404, "ATTEMPT_NOT_FOUND");
      if (row.status === "completed") return buildResult(row);

      const submitted = parseAnswers(answers, row.questions);
      const correctCount = row.questions.reduce(
        (total, question, index) => total + (submitted[index] === question.correctAnswer ? 1 : 0),
        0,
      );
      const score = Math.round((correctCount / row.questions.length) * 10_000) / 100;
      const timestamp = new Date().toISOString();
      const updated = await client.query<AttemptRow>(
        "UPDATE exam_attempts SET status='completed', answers=$3, score=$4, correct_count=$5, completed_at=$6, updated_at=$6 WHERE id=$1 AND user_id=$2 AND status<>'completed' RETURNING *",
        [attemptId, userId, JSON.stringify(submitted), score, correctCount, timestamp],
      );
      let finalRow = updated.rows[0];
      if (!finalRow) {
        const refreshed = await client.query<AttemptRow>("SELECT * FROM exam_attempts WHERE id=$1 AND user_id=$2", [attemptId, userId]);
        finalRow = refreshed.rows[0];
      }
      if (!finalRow) reject(404, "ATTEMPT_NOT_FOUND");
      return buildResult(finalRow);
    });
  },
};
