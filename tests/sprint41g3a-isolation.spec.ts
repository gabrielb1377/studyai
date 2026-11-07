import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import type { SessionOperation } from "../src/features/account/SessionOperationManager";

function loadModule(file: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const source = readFileSync(path.join(process.cwd(), file), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const compiled = { exports: {} };
  vm.runInNewContext(js, { module: compiled, exports: compiled.exports, require: (id: string) => dependencies[id], AbortController, Error, Date, JSON, Math, Object, Set, Promise, URL, Request, Response, TextEncoder, console, crypto, randomUUID: () => crypto.randomUUID(), performance, ...globals });
  return compiled.exports;
}

type RequireSessionOwner = (request: Request, userId: string) => void;

type RequireUser = (request: Request) => { sub: string };

function fakeLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    get length() { return store.size; },
    key: (index: number) => [...store.keys()][index] ?? null,
  } as unknown as Storage;
}

test.describe("Auditoria de isolamento — Sprint 41G.3A", () => {

  test("SessionOperationManager: operação iniciada por A é rejeitada quando sessão muda para B", () => {
    const { SessionOperationManager } = loadModule("src/features/account/SessionOperationManager.ts", {}) as {
      SessionOperationManager: { activate: (id?: string) => void; start: (id?: string) => SessionOperation };
    };

    SessionOperationManager.activate("user-a");
    const opA = SessionOperationManager.start("user-a");

    SessionOperationManager.activate("user-b");

    let error: unknown = null;
    try { opA.assertCurrent(); } catch (e) { error = e; }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBe("SessionChangedError");
  });

  test("SessionOperationManager: A → B → A, operações antigas da primeira sessão de A não são aceitas", () => {
    const { SessionOperationManager } = loadModule("src/features/account/SessionOperationManager.ts", {}) as {
      SessionOperationManager: { activate: (id?: string) => void; start: (id?: string) => SessionOperation };
    };

    SessionOperationManager.activate("user-a");
    const opA1 = SessionOperationManager.start("user-a");

    SessionOperationManager.activate("user-b");
    const opB = SessionOperationManager.start("user-b");

    SessionOperationManager.activate("user-a");
    const opA2 = SessionOperationManager.start("user-a");

    let error: unknown = null;
    try { opA1.assertCurrent(); } catch (e) { error = e; }
    expect(error).toBeInstanceOf(Error);

    error = null;
    try { opB.assertCurrent(); } catch (e) { error = e; }
    expect(error).toBeInstanceOf(Error);

    opA2.assertCurrent(); // não deve lançar
  });

  test("isPrivateSessionKey identifica chaves privadas por usuário e não identifica públicas", () => {
    const { isPrivateSessionKey } = loadModule("src/features/account/SessionLocalData.ts", {
      "@/lib/storage/StorageManager": { StorageManager: { put: async () => {}, get: async () => null } },
      "@/lib/storage/Database": { currentDatabaseName: () => "studyai-db" },
      "@/services/material-runtime-store": { MaterialRuntimeStore: { clear: () => {} } },
      "@/features/search/GlobalSearchService": { GlobalSearchService: { clearCache: () => {} } },
      "@/features/preferences/ExperiencePreferences": { ExperiencePreferencesService: { invalidate: () => {} } },
      "@/features/sync/SyncPreferences": { isSyncPreferenceKey: (key: string) => ["studyai:workspace", "studyai:ai-settings", "studyai:experience-settings", "studyai:exams"].some((p) => key.startsWith(p)) },
    }) as { isPrivateSessionKey: (key: string) => boolean; };

    expect(isPrivateSessionKey("studyai:exams")).toBe(true);
    expect(isPrivateSessionKey("studyai:workspace:study-1")).toBe(true);
    expect(isPrivateSessionKey("studyai:ai-settings")).toBe(true);
    expect(isPrivateSessionKey("studyai-theme")).toBe(false);
    expect(isPrivateSessionKey("studyai:platform-settings")).toBe(false);
    expect(isPrivateSessionKey("studyai:active-session-owner")).toBe(false);
    expect(isPrivateSessionKey("studyai:dados-publicos")).toBe(false);
    expect(isPrivateSessionKey("outra-chave-qualquer")).toBe(false);
  });

  test("SessionLocalData: resume não restaura dados de outro usuário", async () => {
    const localStorage = fakeLocalStorage();
    localStorage.setItem("studyai:active-session-owner", "user-b");

    const { SessionLocalData } = loadModule("src/features/account/SessionLocalData.ts", {
      "@/lib/storage/StorageManager": { StorageManager: {
        put: async () => {},
        get: async () => ({ key: "session-local-preferences:v1", value: { "studyai:exams": "plano-de-a" }, updatedAt: new Date().toISOString(), owner: "user-a" }),
      } },
      "@/lib/storage/Database": { currentDatabaseName: () => "studyai-db:user-user-c" },
      "@/services/material-runtime-store": { MaterialRuntimeStore: { clear: () => {} } },
      "@/features/search/GlobalSearchService": { GlobalSearchService: { clearCache: () => {} } },
      "@/features/preferences/ExperiencePreferences": { ExperiencePreferencesService: { invalidate: () => {} } },
      "@/features/sync/SyncPreferences": { isSyncPreferenceKey: (key: string) => ["studyai:workspace", "studyai:ai-settings", "studyai:experience-settings", "studyai:exams"].some((p) => key.startsWith(p)) },
    }, { localStorage, crypto }) as {
      SessionLocalData: { resume: (userId: string) => Promise<void>; };
    };

    await SessionLocalData.resume("user-c");

    expect(localStorage.getItem("studyai:active-session-owner")).toBe("user-c");
    expect(localStorage.getItem("studyai:exams")).toBeNull();
  });

  test("CloudDatabase (memória): isolamento cross-user em registros de sync", async () => {
    const cloudModule = loadModule("src/server/cloud/CloudDatabase.ts", {
      "server-only": {},
      "node:crypto": { randomUUID: () => crypto.randomUUID() },
      "@/server/database/Postgres": { hasPostgres: () => false, query: async () => ({ rows: [] }), transaction: async (op: (client: { query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[] }> }) => Promise<unknown>) => op({ query: async () => ({ rows: [] }) }) },
    }) as { CloudDatabase: unknown };
    const CloudDatabase = cloudModule.CloudDatabase as {
      writeRecord: (record: { userId: string; entity: string; recordId: string; data: unknown; version: number; hash: string; updatedAt: string; deviceId: string }) => Promise<unknown>;
      record: (userId: string, entity: string, recordId: string) => Promise<{ data: unknown; userId: string } | undefined>;
      allRecords: (userId: string) => Promise<Array<{ userId: string }>>;
    };

    await CloudDatabase.writeRecord({ userId: "user-a", entity: "documents", recordId: "doc-1", data: { texto: "segredo-de-a" }, version: 1, hash: "hash-a", updatedAt: new Date().toISOString(), deviceId: "dev-a" });
    await CloudDatabase.writeRecord({ userId: "user-b", entity: "documents", recordId: "doc-1", data: { texto: "segredo-de-b" }, version: 1, hash: "hash-b", updatedAt: new Date().toISOString(), deviceId: "dev-b" });

    const recordA = await CloudDatabase.record("user-a", "documents", "doc-1");
    expect(recordA?.data).toEqual({ texto: "segredo-de-a" });

    const recordB = await CloudDatabase.record("user-b", "documents", "doc-1");
    expect(recordB?.data).toEqual({ texto: "segredo-de-b" });

    const allA = await CloudDatabase.allRecords("user-a");
    expect(allA.length).toBe(1);
    expect(allA[0]?.userId).toBe("user-a");

    const allB = await CloudDatabase.allRecords("user-b");
    expect(allB.length).toBe(1);
    expect(allB[0]?.userId).toBe("user-b");
  });

  test("requireSessionOwner rejeita quando o cabeçalho não confere com o usuário", async () => {
    const { requireSessionOwner } = loadModule("src/server/auth/http.ts", {
      "server-only": {},
      "next/server": { NextResponse: { json: (data: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body: JSON.stringify(data) }) } },
      "./AuthService": { AuthService: { access: () => ({ sub: "user-a" }) } },
      "@/server/security/Crypto": { constantTimeEqual: (left: string, right: string) => left === right },
    }) as { requireSessionOwner: RequireSessionOwner; };

    requireSessionOwner(new Request("http://local/api/x", { headers: { "x-studyai-session-user": "user-a" } }), "user-a");

    let error: unknown = null;
    try { requireSessionOwner(new Request("http://local/api/x", { headers: { "x-studyai-session-user": "user-b" } }), "user-a"); } catch (e) { error = e; }
    expect(error).toBeInstanceOf(Response);
    expect((error as Response).status).toBe(409);

    error = null;
    try { requireSessionOwner(new Request("http://local/api/x"), "user-a"); } catch (e) { error = e; }
    expect(error).toBeInstanceOf(Response);
    expect((error as Response).status).toBe(409);
  });

  test("requireUser rejeita requisição sem sessão válida", async () => {
    const { requireUser } = loadModule("src/server/auth/http.ts", {
      "server-only": {},
      "next/server": { NextResponse: { json: (data: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body: JSON.stringify(data) }) } },
      "./AuthService": { AuthService: { access: () => undefined } },
      "@/server/security/Crypto": { constantTimeEqual: (left: string, right: string) => left === right },
    }) as { requireUser: RequireUser; };

    let error: unknown = null;
    try { requireUser(new Request("http://local/api/x", { headers: { cookie: "studyai_access=token-invalido" } })); } catch (e) { error = e; }
    expect(error).toBeInstanceOf(Response);
    expect((error as Response).status).toBe(401);
  });

  test("ExamAttemptServer: tentativa de usuário B não acessível por usuário A (isolamento cross-user)", async () => {
    const examModule = loadModule("src/server/exam/ExamAttemptServer.ts", {
      "server-only": {},
      "node:crypto": { randomUUID: () => crypto.randomUUID() },
      "@/server/database/Postgres": {
        hasPostgres: () => true,
        query: async () => ({ rows: [] }),
        transaction: async (op: (client: { query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[] }> }) => Promise<unknown>) => op({ query: async () => ({ rows: [] }) }),
      },
    }) as { ExamAttemptServer: unknown };
    const ExamAttemptServer = examModule.ExamAttemptServer as {
      create: (userId: string, input: { title?: unknown; questions?: unknown }) => Promise<{ attemptId: string }>;
      get: (userId: string, attemptId: string) => Promise<unknown>;
      grade: (userId: string, attemptId: string, answers: unknown) => Promise<unknown>;
    };

    const attempt = await ExamAttemptServer.create("user-a", {
      title: "Prova isolada",
      questions: [
        { id: "q1", question: "Q1?", alternatives: ["A", "B", "C", "D"], correctAnswer: 0, explanation: "E1" },
      ],
    });

    let error: unknown = null;
    try { await ExamAttemptServer.get("user-b", attempt.attemptId); } catch (e) { error = e; }
    expect(error).toBeInstanceOf(Response);
    expect((error as Response).status).toBe(404);
  });

  test("Rota de arquivo exige proprietário da sessão (requireSessionOwner)", async () => {
    const source = readFileSync(path.join(process.cwd(), "src/app/api/files/[id]/route.ts"), "utf8");
    expect(source).toContain("requireSessionOwner");
    expect(source).toContain("requireUser");
    expect(source).toContain("requireCsrf");
  });

  test("Rota de arquivo direto exige proprietário da sessão", async () => {
    const source = readFileSync(path.join(process.cwd(), "src/app/api/files/[id]/direct/route.ts"), "utf8");
    expect(source).toContain("requireSessionOwner");
    expect(source).toContain("requireUser");
    expect(source).toContain("requireCsrf");
  });

  test("Rota de prova protegida exige proprietário da sessão", async () => {
    const source = readFileSync(path.join(process.cwd(), "src/app/api/exam/attempt/route.ts"), "utf8");
    expect(source).toContain("requireSessionOwner");
    expect(source).toContain("requireUser");
    expect(source).toContain("requireCsrf");
  });

  test("Rota de correção de prova exige proprietário da sessão", async () => {
    const source = readFileSync(path.join(process.cwd(), "src/app/api/exam/grade/route.ts"), "utf8");
    expect(source).toContain("requireSessionOwner");
    expect(source).toContain("requireUser");
    expect(source).toContain("requireCsrf");
  });

});
