import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { Pool } from "pg";

function loadModule(file: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const source = readFileSync(path.join(process.cwd(), file), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const compiled = { exports: {} };
  vm.runInNewContext(js, { module: compiled, exports: compiled.exports, require: (id: string) => dependencies[id], AbortController, Error, Date, JSON, Math, Object, Set, Promise, URL, Request, Response, TextEncoder, console, crypto, randomUUID: () => crypto.randomUUID(), performance, ...globals });
  return compiled.exports;
}

/**
 * PORTÃO DE SEGURANÇA: testes de integração real só executam contra um
 * PostgreSQL NÃO PRODUTIVO. Exigem DATABASE_URL definida e NODE_ENV diferente
 * de "production". Nunca usam credenciais de produção nem inventam valores.
 * Quando não há banco não produtivo disponível, os testes pulam com aviso claro
 * em vez de falhar ou apontar para produção.
 */
function isNonProdPostgresAvailable(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim()) && process.env.NODE_ENV !== "production";
}

const DB_GATE_MSG = [
  "Integração real com PostgreSQL bloqueada: defina DATABASE_URL para um banco",
  "não produtivo e NÃO defina NODE_ENV=production. Nenhuma credencial de",
  "produção será usada. Teste pulado até que um banco não produtivo esteja disponível.",
].join(" ");

const USER_A = "integration-exam-user-a";
const USER_B = "integration-exam-user-b";

const QUESTIONS = [
  {
    id: "q1",
    question: "Quanto é 2 + 2?",
    alternatives: ["3", "4", "5", "6"],
    correctAnswer: 1,
    explanation: "2 + 2 = 4.",
  },
  {
    id: "q2",
    question: "Capital do Brasil?",
    alternatives: ["Rio", "Brasília", "São Paulo", "Salvador"],
    correctAnswer: 1,
    explanation: "Brasília é a capital.",
  },
];

async function ensureUsers(pool: Pool) {
  await pool.query(
    "INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING",
    [USER_A, "integration-a@local", "x"],
  );
  await pool.query(
    "INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING",
    [USER_B, "integration-b@local", "x"],
  );
}

async function cleanupAttempts(pool: Pool, ...userIds: string[]) {
  for (const userId of userIds) {
    await pool.query("DELETE FROM exam_attempts WHERE user_id = $1", [userId]);
  }
}

type PgQueryResult = { rows: Record<string, unknown>[] };
type PgQuery = (text: string, values?: unknown[]) => Promise<PgQueryResult>;
type PgTransaction = <T>(op: (client: { query: PgQuery }) => Promise<T>) => Promise<T>;

type ExamAttemptResultLike = {
  attemptId: string;
  status: "completed";
  score: number;
  correctCount: number;
  totalCount: number;
  answers: number[];
  questions: Array<{ correctAnswer: number; explanation: string }>;
  completedAt: string;
};

type ExamAttemptRecordLike = {
  attemptId: string;
  status: string;
  title?: string;
  questions: Record<string, unknown>[];
  totalCount: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  result?: ExamAttemptResultLike;
};

async function loadRealServer() {
  const realPostgres = loadModule("src/server/database/Postgres.ts", { "server-only": {}, pg: { Pool } });
  const { hasPostgres, query, transaction } = realPostgres as {
    hasPostgres: () => boolean;
    query: PgQuery;
    transaction: PgTransaction;
  };
  const server = loadModule("src/server/exam/ExamAttemptServer.ts", {
    "server-only": {},
    "node:crypto": { randomUUID: () => crypto.randomUUID() },
    "@/server/database/Postgres": { hasPostgres, query, transaction },
  }) as {
    ExamAttemptServer: {
      create: (userId: string, input: { title?: unknown; questions?: unknown }) => Promise<ExamAttemptRecordLike>;
      get: (userId: string, attemptId: string) => Promise<ExamAttemptRecordLike>;
      grade: (userId: string, attemptId: string, answers: unknown) => Promise<ExamAttemptResultLike>;
    };
  };
  return { server, realPostgres };
}

test.describe("Integração real — Modo Prova protegido (PostgreSQL não produtivo)", () => {
  test("criação persiste tentativa no banco e omite gabarito do cliente", async () => {
    test.skip(!isNonProdPostgresAvailable(), DB_GATE_MSG);
    const pool = new Pool({ connectionString: process.env.DATABASE_URL!, connectionTimeoutMillis: 8_000 });
    try {
      await ensureUsers(pool);
      const { server } = await loadRealServer();
      const attempt = await server.ExamAttemptServer.create(USER_A, { title: "Prova integração", questions: QUESTIONS });
      expect(attempt.attemptId).toBeTruthy();
      expect(attempt.status).toBe("created");
      expect(attempt.totalCount).toBe(2);

      // O payload devolvido ao cliente NÃO contém o gabarito nem explicações.
      expect(JSON.stringify(attempt.questions)).not.toContain("correctAnswer");
      expect(JSON.stringify(attempt.questions)).not.toContain("explanation");

      // O banco, sim, armazena o gabarito completo (somente no servidor).
      const row = await pool.query("SELECT questions FROM exam_attempts WHERE id = $1", [attempt.attemptId]);
      expect(row.rows.length).toBe(1);
      expect(JSON.stringify(row.rows[0].questions)).toContain("correctAnswer");
      expect(JSON.stringify(row.rows[0].questions)).toContain("explanation");
    } finally {
      await cleanupAttempts(pool, USER_A);
      await pool.end();
    }
  });

  test("retomada devolve tentativa em andamento sem gabarito", async () => {
    test.skip(!isNonProdPostgresAvailable(), DB_GATE_MSG);
    const pool = new Pool({ connectionString: process.env.DATABASE_URL!, connectionTimeoutMillis: 8_000 });
    try {
      await ensureUsers(pool);
      const { server } = await loadRealServer();
      const attempt = await server.ExamAttemptServer.create(USER_A, { title: "Retomada", questions: QUESTIONS });
      const resumed = await server.ExamAttemptServer.get(USER_A, attempt.attemptId);
      expect(resumed.status).toBe("created");
      expect(JSON.stringify(resumed.questions)).not.toContain("correctAnswer");
      expect(JSON.stringify(resumed.questions)).not.toContain("explanation");
    } finally {
      await cleanupAttempts(pool, USER_A);
      await pool.end();
    }
  });

  test("correção libera gabarito e explicações somente após entrega autorizada", async () => {
    test.skip(!isNonProdPostgresAvailable(), DB_GATE_MSG);
    const pool = new Pool({ connectionString: process.env.DATABASE_URL!, connectionTimeoutMillis: 8_000 });
    try {
      await ensureUsers(pool);
      const { server } = await loadRealServer();
      const attempt = await server.ExamAttemptServer.create(USER_A, { title: "Correção", questions: QUESTIONS });

      // Antes da entrega: tentativa sem gabarito.
      const before = await server.ExamAttemptServer.get(USER_A, attempt.attemptId);
      expect(JSON.stringify(before.questions)).not.toContain("correctAnswer");

      // Após a entrega autorizada: resultado inclui gabarito e explicações.
      const result = await server.ExamAttemptServer.grade(USER_A, attempt.attemptId, [1, 1]);
      expect(result.status).toBe("completed");
      expect(result.score).toBe(100);
      expect(result.correctCount).toBe(2);
      expect(result.questions.every((q) => typeof q.correctAnswer === "number" && typeof q.explanation === "string")).toBe(true);

      // A retomada após conclusão inclui o resultado autorizado.
      const after = await server.ExamAttemptServer.get(USER_A, attempt.attemptId);
      expect(after.status).toBe("completed");
      expect(after.result?.score).toBe(100);
      expect(JSON.stringify(after.result?.questions ?? [])).toContain("correctAnswer");
      expect(JSON.stringify(after.result?.questions ?? [])).toContain("explanation");
    } finally {
      await cleanupAttempts(pool, USER_A);
      await pool.end();
    }
  });

  test("entrega duplicada preserva o resultado original (idempotência)", async () => {
    test.skip(!isNonProdPostgresAvailable(), DB_GATE_MSG);
    const pool = new Pool({ connectionString: process.env.DATABASE_URL!, connectionTimeoutMillis: 8_000 });
    try {
      await ensureUsers(pool);
      const { server } = await loadRealServer();
      const attempt = await server.ExamAttemptServer.create(USER_A, { title: "Idempotência", questions: QUESTIONS });
      const first = await server.ExamAttemptServer.grade(USER_A, attempt.attemptId, [1, 1]);
      const second = await server.ExamAttemptServer.grade(USER_A, attempt.attemptId, [0, 0]);
      expect(second.score).toBe(first.score);
      expect(second.correctCount).toBe(first.correctCount);
      const row = await pool.query("SELECT answers, score FROM exam_attempts WHERE id = $1", [attempt.attemptId]);
      expect(row.rows.length).toBe(1);
      expect(JSON.parse(JSON.stringify(row.rows[0].answers))).toEqual([1, 1]);
    } finally {
      await cleanupAttempts(pool, USER_A);
      await pool.end();
    }
  });

  test("duas entregas simultâneas produzem um único resultado (concorrência)", async () => {
    test.skip(!isNonProdPostgresAvailable(), DB_GATE_MSG);
    const pool = new Pool({ connectionString: process.env.DATABASE_URL!, connectionTimeoutMillis: 8_000 });
    try {
      await ensureUsers(pool);
      const { server } = await loadRealServer();
      const attempt = await server.ExamAttemptServer.create(USER_A, { title: "Concorrência", questions: QUESTIONS });
      const [first, second] = await Promise.all([
        server.ExamAttemptServer.grade(USER_A, attempt.attemptId, [1, 1]),
        server.ExamAttemptServer.grade(USER_A, attempt.attemptId, [0, 0]),
      ]);
      expect(first.score).toBe(second.score);
      expect(first.correctCount).toBe(second.correctCount);
      const row = await pool.query("SELECT status, score FROM exam_attempts WHERE id = $1", [attempt.attemptId]);
      expect(row.rows.length).toBe(1);
      expect(row.rows[0].status).toBe("completed");
    } finally {
      await cleanupAttempts(pool, USER_A);
      await pool.end();
    }
  });

  test("tentativa de outro usuário não é acessível (isolamento cross-user)", async () => {
    test.skip(!isNonProdPostgresAvailable(), DB_GATE_MSG);
    const pool = new Pool({ connectionString: process.env.DATABASE_URL!, connectionTimeoutMillis: 8_000 });
    try {
      await ensureUsers(pool);
      const { server } = await loadRealServer();
      const attempt = await server.ExamAttemptServer.create(USER_A, { title: "Isolamento", questions: QUESTIONS });

      let getError: unknown = null;
      try { await server.ExamAttemptServer.get(USER_B, attempt.attemptId); } catch (e) { getError = e; }
      expect((getError as Response).status).toBe(404);

      let gradeError: unknown = null;
      try { await server.ExamAttemptServer.grade(USER_B, attempt.attemptId, [1, 1]); } catch (e) { gradeError = e; }
      expect((gradeError as Response).status).toBe(404);

      // A tentativa de A permanece intacta.
      const intact = await server.ExamAttemptServer.get(USER_A, attempt.attemptId);
      expect(intact.status).toBe("created");
    } finally {
      await cleanupAttempts(pool, USER_A, USER_B);
      await pool.end();
    }
  });

  test("sem DATABASE_URL não produtivo não executa (confirma bloqueio)", () => {
    expect(isNonProdPostgresAvailable()).toBe(false);
    // Este teste documenta que a validação real está bloqueada até que um
    // banco não produtivo seja disponibilizado. Não aponta para produção.
  });
});
