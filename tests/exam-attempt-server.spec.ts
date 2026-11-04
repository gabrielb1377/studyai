import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

function loadModule(file: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const source = readFileSync(path.join(process.cwd(), file), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const compiled = { exports: {} };
  vm.runInNewContext(js, { module: compiled, exports: compiled.exports, require: (id: string) => dependencies[id], AbortController, Error, Date, JSON, Math, Object, Set, Promise, URL, Request, Response, TextEncoder, console, crypto, randomUUID: () => crypto.randomUUID(), ...globals });
  return compiled.exports;
}

class FakeNextResponse {
  status: number;
  body: string;
  constructor(body: unknown, init?: { status?: number }) {
    this.body = typeof body === "string" ? body : String(body ?? "");
    this.status = init?.status ?? 200;
  }
  static json(data: unknown, init?: { status?: number }) {
    return { status: init?.status ?? 200, body: JSON.stringify(data) } as { status: number; body: string };
  }
}

type FakeRow = Record<string, unknown>;

function createFakePostgres() {
  const table = new Map<string, FakeRow>();
  const listeners: Array<(reason: string) => void> = [];
  let failure: { code?: string } | undefined;
  const api = {
    table,
    failWith(next: { code?: string } | undefined) { failure = next; },
    onCommit(listener: (reason: string) => void) { listeners.push(listener); },
  };
  const raiseIfConfigured = () => { if (failure) throw Object.assign(new Error(`simulated ${failure.code ?? "error"}`), failure); };
  const database = {
    hasPostgres: () => true,
    query: async <T extends FakeRow>(text: string, values: unknown[] = []) => {
      raiseIfConfigured();
      const rows: FakeRow[] = [];
      if (/INSERT INTO exam_attempts/i.test(text)) {
        const [id, userId, title, questions, totalCount, timestamp] = values;
        table.set(String(id), { id, user_id: userId, status: "created", title: title ?? null, questions: JSON.parse(String(questions)), answers: null, score: null, correct_count: null, total_count: Number(totalCount), created_at: timestamp, updated_at: timestamp, completed_at: null });
        rows.push(table.get(String(id))!);
      } else if (/SELECT \* FROM exam_attempts WHERE id=\$1 AND user_id=\$2( FOR UPDATE)?$/i.test(text)) {
        const row = table.get(String(values[0]));
        if (row && row.user_id === values[1]) rows.push(row);
      } else if (/UPDATE exam_attempts/i.test(text)) {
        const [id, userId, answers, score, correctCount, timestamp] = values;
        const row = table.get(String(id));
        if (row && row.user_id === userId && row.status !== "completed") {
          row.status = "completed";
          row.answers = JSON.parse(String(answers));
          row.score = score;
          row.correct_count = correctCount;
          row.completed_at = timestamp;
          row.updated_at = timestamp;
          rows.push(row);
        }
      }
      return { rows: rows as T[] };
    },
    transaction: async <T>(operation: (client: { query: (text: string, values?: unknown[]) => Promise<{ rows: FakeRow[] }> }) => Promise<T>) => {
      raiseIfConfigured();
      const result = await operation({ query: database.query });
      listeners.forEach((listener) => listener("commit"));
      return result;
    },
  };
  return { api, database };
}

function loadHttp(nextServer: unknown) {
  return loadModule("src/server/auth/http.ts", {
    "server-only": {},
    "next/server": nextServer,
    "./AuthService": { AuthService: {} },
    "@/server/security/Crypto": { constantTimeEqual: (left: string, right: string) => left === right },
  }) as { apiError: (error: unknown) => { status: number; body: string } };
}

const QUESTIONS = [
  { id: "q1", question: "Quanto é 2 + 2?", alternatives: ["3", "4", "5", "6"], correctAnswer: 1, explanation: "2 + 2 = 4." },
  { id: "q2", question: "Capital do Brasil?", alternatives: ["Rio", "Brasília", "São Paulo", "Salvador"], correctAnswer: 1, explanation: "Brasília é a capital." },
];

const GENERATED = Array.from({ length: 5 }, (_, index) => ({
  id: `g${index + 1}`,
  question: `Questão protegida ${index + 1}?`,
  alternatives: ["Alternativa A", "Alternativa B", "Alternativa C", "Alternativa D"],
  correctAnswer: index % 4,
  explanation: `Explicação da questão ${index + 1}.`,
  difficulty: "medium",
}));

const SECURE_PAYLOAD = {
  studyId: "study-1",
  title: "Prova protegida",
  subject: "Matemática",
  chunks: [{ id: "chunk-1", studyId: "study-1" }],
  count: 5,
  difficulty: "medium",
};

function loadSecureRoute(database: unknown, http: Record<string, unknown>, generated = GENERATED) {
  const serverModule = loadModule("src/server/exam/ExamAttemptServer.ts", {
    "server-only": {},
    "node:crypto": { randomUUID: () => crypto.randomUUID() },
    "@/server/database/Postgres": database,
  });
  return loadModule("src/app/api/exam/attempt/route.ts", {
    "next/server": { NextResponse: FakeNextResponse },
    "@/server/auth/http": http,
    "@/server/database/Postgres": database,
    "@/server/exam/ExamAttemptServer": serverModule,
    "@/features/ai/AIService": { AIService: { generate: async () => ({ text: JSON.stringify(generated), provider: "mock", model: "mock" }) } },
    "@/features/ai/PromptBuilder": { PromptBuilder: { examQuiz: () => "prompt" } },
    "@/server/ai/QuotaMiddleware": {
      withAIQuota: async (request: Request, handler: (request: Request, aiRequest: Record<string, unknown>) => Promise<unknown>) =>
        handler(request, { history: [], message: "prompt", apiKeys: undefined }),
    },
    "@/features/retrieval/retrieval-validation": { isRetrievedChunk: () => true },
  }) as { POST: (request: Request) => Promise<{ status: number; body: string }> };
}

function authenticatedHttp() {
  const http = loadHttp({ NextResponse: FakeNextResponse }) as unknown as Record<string, unknown>;
  http.requireCsrf = () => undefined;
  http.requireUser = () => ({ sub: "user-A" });
  http.requireSessionOwner = () => undefined;
  return http;
}

async function statusOf(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (value: unknown) => value);
  expect(error, "a operação deveria falhar").toBeInstanceOf(Response);
  return (error as Response).status;
}

function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(url, { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": "csrf", ...headers }, body: JSON.stringify(body) });
}

test("cria tentativa autenticada e não devolve gabarito nem explicações", async () => {
  const { api, database } = createFakePostgres();
  const server = loadModule("src/server/exam/ExamAttemptServer.ts", { "server-only": {}, "node:crypto": { randomUUID: () => crypto.randomUUID() }, "@/server/database/Postgres": database }) as { ExamAttemptServer: { create: (userId: string, input: unknown) => Promise<{ attemptId: string; status: string; questions: Array<Record<string, unknown>>; totalCount: number }> } };
  const attempt = await server.ExamAttemptServer.create("user-A", { title: "P2", questions: QUESTIONS });
  expect(attempt.attemptId).toBeTruthy();
  expect(attempt.status).toBe("created");
  expect(attempt.totalCount).toBe(2);
  expect(attempt.questions).toHaveLength(2);
  expect(JSON.stringify(attempt.questions)).not.toContain("correctAnswer");
  expect(JSON.stringify(attempt.questions)).not.toContain("explanation");
  const stored = api.table.get(attempt.attemptId)!;
  expect(stored.user_id).toBe("user-A");
  expect((stored.questions as Array<{ correctAnswer: number }>).every((question) => typeof question.correctAnswer === "number")).toBe(true);
});

test("valida formato e quantidade das questões antes de persistir", async () => {
  const { api, database } = createFakePostgres();
  const server = loadModule("src/server/exam/ExamAttemptServer.ts", { "server-only": {}, "node:crypto": { randomUUID: () => crypto.randomUUID() }, "@/server/database/Postgres": database }) as { ExamAttemptServer: { create: (userId: string, input: unknown) => Promise<unknown> } };
  expect(await statusOf(server.ExamAttemptServer.create("user-A", { questions: [] }))).toBe(400);
  expect(await statusOf(server.ExamAttemptServer.create("user-A", { questions: [{ ...QUESTIONS[0], correctAnswer: 9 }] }))).toBe(400);
  expect(await statusOf(server.ExamAttemptServer.create("user-A", { questions: [{ ...QUESTIONS[0], alternatives: ["única"] }] }))).toBe(400);
  expect(await statusOf(server.ExamAttemptServer.create("user-A", { questions: [{ ...QUESTIONS[0], alternatives: ["A", "a", "B", "C"] }] }))).toBe(400);
  expect(await statusOf(server.ExamAttemptServer.create("user-A", { questions: [{ ...QUESTIONS[0], explanation: "" }] }))).toBe(400);
  expect(await statusOf(server.ExamAttemptServer.create("user-A", { questions: [{ ...QUESTIONS[0], difficulty: "impossible" }] }))).toBe(400);
  expect(api.table.size).toBe(0);
});

test("correção correta pontua com o gabarito armazenado e libera explicações", async () => {
  const { database } = createFakePostgres();
  const server = loadModule("src/server/exam/ExamAttemptServer.ts", { "server-only": {}, "node:crypto": { randomUUID: () => crypto.randomUUID() }, "@/server/database/Postgres": database }) as { ExamAttemptServer: { create: (userId: string, input: unknown) => Promise<{ attemptId: string }>; grade: (userId: string, attemptId: string, answers: unknown) => Promise<{ status: string; score: number; correctCount: number; questions: Array<{ correctAnswer: number; explanation: string }> }> } };
  const attempt = await server.ExamAttemptServer.create("user-A", { questions: QUESTIONS });
  const result = await server.ExamAttemptServer.grade("user-A", attempt.attemptId, [1, 0]);
  expect(result.status).toBe("completed");
  expect(result.score).toBe(50);
  expect(result.correctCount).toBe(1);
  expect(result.questions.every((question) => typeof question.correctAnswer === "number" && typeof question.explanation === "string")).toBe(true);
});

test("entrega duplicada preserva o resultado original (idempotente)", async () => {
  const { api, database } = createFakePostgres();
  const server = loadModule("src/server/exam/ExamAttemptServer.ts", { "server-only": {}, "node:crypto": { randomUUID: () => crypto.randomUUID() }, "@/server/database/Postgres": database }) as { ExamAttemptServer: { create: (userId: string, input: unknown) => Promise<{ attemptId: string }>; grade: (userId: string, attemptId: string, answers: unknown) => Promise<{ score: number; correctCount: number }> } };
  const attempt = await server.ExamAttemptServer.create("user-A", { questions: QUESTIONS });
  const first = await server.ExamAttemptServer.grade("user-A", attempt.attemptId, [1, 1]);
  const second = await server.ExamAttemptServer.grade("user-A", attempt.attemptId, [0, 0]);
  expect(second.score).toBe(first.score);
  expect(second.correctCount).toBe(first.correctCount);
  const stored = api.table.get(attempt.attemptId)!;
  expect(stored.score).toBe(first.score);
  expect(stored.answers).toEqual([1, 1]);
});

test("duas entregas simultâneas produzem o mesmo resultado único", async () => {
  const { api, database } = createFakePostgres();
  const server = loadModule("src/server/exam/ExamAttemptServer.ts", { "server-only": {}, "node:crypto": { randomUUID: () => crypto.randomUUID() }, "@/server/database/Postgres": database }) as { ExamAttemptServer: { create: (userId: string, input: unknown) => Promise<{ attemptId: string }>; grade: (userId: string, attemptId: string, answers: unknown) => Promise<{ score: number }> } };
  const attempt = await server.ExamAttemptServer.create("user-A", { questions: QUESTIONS });
  const [first, second] = await Promise.all([
    server.ExamAttemptServer.grade("user-A", attempt.attemptId, [1, 1]),
    server.ExamAttemptServer.grade("user-A", attempt.attemptId, [0, 0]),
  ]);
  expect(first.score).toBe(second.score);
  const stored = api.table.get(attempt.attemptId)!;
  expect(stored.status).toBe("completed");
  expect(stored.score).toBe(first.score);
});

test("tentativa pertencente a outro usuário não é acessível", async () => {
  const { database } = createFakePostgres();
  const server = loadModule("src/server/exam/ExamAttemptServer.ts", { "server-only": {}, "node:crypto": { randomUUID: () => crypto.randomUUID() }, "@/server/database/Postgres": database }) as { ExamAttemptServer: { create: (userId: string, input: unknown) => Promise<{ attemptId: string }>; get: (userId: string, attemptId: string) => Promise<unknown>; grade: (userId: string, attemptId: string, answers: unknown) => Promise<unknown> } };
  const attempt = await server.ExamAttemptServer.create("user-A", { questions: QUESTIONS });
  expect(await statusOf(server.ExamAttemptServer.get("user-B", attempt.attemptId))).toBe(404);
  expect(await statusOf(server.ExamAttemptServer.grade("user-B", attempt.attemptId, [1, 1]))).toBe(404);
});

test("retomada devolve a tentativa em andamento sem gabarito", async () => {
  const { database } = createFakePostgres();
  const server = loadModule("src/server/exam/ExamAttemptServer.ts", { "server-only": {}, "node:crypto": { randomUUID: () => crypto.randomUUID() }, "@/server/database/Postgres": database }) as { ExamAttemptServer: { create: (userId: string, input: unknown) => Promise<{ attemptId: string }>; get: (userId: string, attemptId: string) => Promise<{ status: string; questions: Array<Record<string, unknown>> }> } };
  const attempt = await server.ExamAttemptServer.create("user-A", { questions: QUESTIONS });
  const resumed = await server.ExamAttemptServer.get("user-A", attempt.attemptId);
  expect(resumed.status).toBe("created");
  expect(JSON.stringify(resumed.questions)).not.toContain("correctAnswer");
  expect(JSON.stringify(resumed.questions)).not.toContain("explanation");
});

test("retomada após a entrega devolve o resultado autorizado", async () => {
  const { database } = createFakePostgres();
  const server = loadModule("src/server/exam/ExamAttemptServer.ts", { "server-only": {}, "node:crypto": { randomUUID: () => crypto.randomUUID() }, "@/server/database/Postgres": database }) as { ExamAttemptServer: { create: (userId: string, input: unknown) => Promise<{ attemptId: string }>; grade: (userId: string, attemptId: string, answers: unknown) => Promise<unknown>; get: (userId: string, attemptId: string) => Promise<{ status: string; result?: { score: number; questions: Array<Record<string, unknown>> } }> } };
  const attempt = await server.ExamAttemptServer.create("user-A", { questions: QUESTIONS });
  await server.ExamAttemptServer.grade("user-A", attempt.attemptId, [1, 1]);
  const resumed = await server.ExamAttemptServer.get("user-A", attempt.attemptId);
  expect(resumed.status).toBe("completed");
  expect(resumed.result?.score).toBe(100);
  expect(JSON.stringify(resumed.result?.questions)).toContain("correctAnswer");
});

test("parser do servidor aceita JSON válido e rejeita quantidade ou alternativas inválidas", () => {
  const server = loadModule("src/server/exam/ExamAttemptServer.ts", { "server-only": {}, "node:crypto": { randomUUID: () => crypto.randomUUID() }, "@/server/database/Postgres": { hasPostgres: () => true } }) as { parseGeneratedQuestions: (text: string, count: number) => Array<Record<string, unknown>> };
  expect(server.parseGeneratedQuestions(JSON.stringify(QUESTIONS), 2)).toHaveLength(2);
  expect(() => server.parseGeneratedQuestions(JSON.stringify(QUESTIONS), 1)).toThrow();
  expect(() => server.parseGeneratedQuestions(JSON.stringify([{ ...QUESTIONS[0], alternatives: ["A", "A", "B", "C"] }]), 1)).toThrow();
  expect(() => server.parseGeneratedQuestions("não é json", 1)).toThrow();
});

test("PostgreSQL ausente falha antes de criar qualquer tentativa", async () => {
  const { api, database } = createFakePostgres();
  database.hasPostgres = () => false;
  const server = loadModule("src/server/exam/ExamAttemptServer.ts", { "server-only": {}, "node:crypto": { randomUUID: () => crypto.randomUUID() }, "@/server/database/Postgres": database }) as { ExamAttemptServer: { create: (userId: string, input: unknown) => Promise<unknown> } };
  expect(await statusOf(server.ExamAttemptServer.create("user-A", { questions: QUESTIONS }))).toBe(503);
  expect(api.table.size).toBe(0);
});

test("PostgreSQL indisponível falha de forma controlada (503) sem fallback em memória", async () => {
  const { api, database } = createFakePostgres();
  const route = loadSecureRoute(database, authenticatedHttp());
  api.failWith({ code: "ECONNREFUSED" });
  const response = await route.POST(post("http://local/api/exam/attempt", SECURE_PAYLOAD));
  expect(response.status).toBe(503);
  expect(JSON.parse(response.body)).toMatchObject({ error: expect.stringContaining("indisponível") });
});

test("rota POST /api/exam/attempt: 401 sem autenticação", async () => {
  const { database } = createFakePostgres();
  const failing = loadModule("src/server/auth/http.ts", {
    "server-only": {},
    "next/server": { NextResponse: FakeNextResponse },
    "./AuthService": { AuthService: { access: () => undefined } },
    "@/server/security/Crypto": { constantTimeEqual: (left: string, right: string) => left === right },
  }) as Record<string, unknown>;
  failing.requireCsrf = () => undefined;
  failing.requireSessionOwner = () => undefined;
  const route = loadSecureRoute(database, failing);
  const denied = await route.POST(post("http://local/api/exam/attempt", SECURE_PAYLOAD));
  expect(denied.status).toBe(401);
});

test("rota POST /api/exam/attempt rejeita gabarito enviado pelo navegador", async () => {
  const { api, database } = createFakePostgres();
  const route = loadSecureRoute(database, authenticatedHttp());
  const response = await route.POST(post("http://local/api/exam/attempt", { ...SECURE_PAYLOAD, questions: QUESTIONS }));
  expect(response.status).toBe(400);
  expect(JSON.parse(response.body)).toMatchObject({ error: "EXAM_PAYLOAD_INVALID" });
  expect(api.table.size).toBe(0);
});

test("rota POST /api/exam/attempt gera no servidor e devolve somente questões sanitizadas", async () => {
  const { api, database } = createFakePostgres();
  const route = loadSecureRoute(database, authenticatedHttp());
  const response = await route.POST(post("http://local/api/exam/attempt", SECURE_PAYLOAD));
  expect(response.status, response.body).toBe(200);
  const body = JSON.parse(response.body) as { questions: Array<Record<string, unknown>>; totalCount: number };
  expect(body.totalCount).toBe(5);
  expect(body.questions).toHaveLength(5);
  expect(JSON.stringify(body.questions)).not.toContain("correctAnswer");
  expect(JSON.stringify(body.questions)).not.toContain("explanation");
  expect(api.table.size).toBe(1);
  expect(JSON.stringify([...api.table.values()][0])).toContain("correctAnswer");
});

test("rota POST /api/exam/grade: 401 sem autenticação", async () => {
  const { database } = createFakePostgres();
  const failing = loadModule("src/server/auth/http.ts", {
    "server-only": {},
    "next/server": { NextResponse: FakeNextResponse },
    "./AuthService": { AuthService: { access: () => undefined } },
    "@/server/security/Crypto": { constantTimeEqual: (left: string, right: string) => left === right },
  });
  const serverModule = loadModule("src/server/exam/ExamAttemptServer.ts", { "server-only": {}, "node:crypto": { randomUUID: () => crypto.randomUUID() }, "@/server/database/Postgres": database });
  const route = loadModule("src/app/api/exam/grade/route.ts", {
    "next/server": { NextResponse: FakeNextResponse },
    "@/server/auth/http": { ...failing, requireCsrf: () => undefined, requireSessionOwner: () => undefined, jsonBody: async (request: Request) => await request.json() },
    "@/server/exam/ExamAttemptServer": serverModule,
  }) as { POST: (request: Request) => Promise<{ status: number; body: string }> };
  const denied = await route.POST(post("http://local/api/exam/grade", { attemptId: "x", answers: [0, 0] }));
  expect(denied.status).toBe(401);
});

test("Modo Prática permanece local e o fluxo protegido fica separado", async () => {
  const quiz = loadModule("src/features/quiz/QuizService.ts", {}) as { QuizService: Record<string, unknown> };
  expect(typeof quiz.QuizService).toBe("object");
  const workspace = readFileSync(path.join(process.cwd(), "src/features/quiz/QuizWorkspace.tsx"), "utf8");
  expect(workspace).toContain("QuizService");
  expect(workspace).toContain("SecureExamPanel");
  expect(workspace).not.toContain("@/server/exam/ExamAttemptServer");
  expect(workspace).not.toContain("/api/exam/attempt");
  expect(workspace).not.toContain("/api/exam/grade");
  const panel = readFileSync(path.join(process.cwd(), "src/features/quiz/SecureExamPanel.tsx"), "utf8");
  expect(panel).toContain("SecureExamClient");
  expect(panel).not.toContain("QuizService");
  expect(panel).not.toContain("/api/tutor/quiz");
});
