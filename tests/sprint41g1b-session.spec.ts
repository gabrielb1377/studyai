import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

function loadModule(file: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const source = readFileSync(path.join(process.cwd(), file), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const compiled = { exports: {} };
  vm.runInNewContext(js, { module: compiled, exports: compiled.exports, require: (id: string) => dependencies[id], AbortController, Error, Date, crypto, ...globals });
  return compiled.exports;
}

test("A → B → A invalida gerações anteriores e aborta operações pendentes", () => {
  const { SessionOperationManager } = loadModule("src/features/account/SessionOperationManager.ts", {} as Record<string, unknown>) as {
    SessionOperationManager: { activate: (id?: string) => void; beginTransition: () => void; start: (id: string) => { generation: number; signal: AbortSignal; assertCurrent: () => void; release: () => void } };
  };
  SessionOperationManager.activate("A");
  const firstA = SessionOperationManager.start("A");
  SessionOperationManager.beginTransition();
  expect(firstA.signal.aborted).toBe(true);
  expect(() => firstA.assertCurrent()).toThrow(/sessão mudou/i);
  SessionOperationManager.activate("B");
  const b = SessionOperationManager.start("B");
  SessionOperationManager.beginTransition();
  SessionOperationManager.activate("A");
  const secondA = SessionOperationManager.start("A");
  expect(b.signal.aborted).toBe(true);
  expect(secondA.generation).toBeGreaterThan(firstA.generation);
  expect(() => secondA.assertCurrent()).not.toThrow();
  secondA.release();
});

test("preferências de A são preservadas no escopo de A e não são aplicadas em B", async () => {
  const values: Record<string, string> = {};
  const localStorage = {
    getItem: (key: string) => values[key] ?? null,
    setItem: (key: string, value: string) => { values[key] = value; Object.defineProperty(localStorage, key, { value, writable: true, configurable: true, enumerable: true }); },
    removeItem: (key: string) => { delete values[key]; delete (localStorage as Record<string, unknown>)[key]; },
  };
  let database = "studyai-db:user-A";
  const records = new Map<string, Map<string, unknown>>();
  const databaseRecords = () => { if (!records.has(database)) records.set(database, new Map()); return records.get(database)!; };
  localStorage.setItem("studyai:active-session-owner", "A");
  localStorage.setItem("studyai:ai-settings", JSON.stringify({ provider: "gemini", marker: "A" }));
  localStorage.setItem("studyai:exams", JSON.stringify([{ id: "plan-A" }]));
  const noOp = { clear: () => undefined, clearCache: () => undefined, invalidate: () => undefined };
  const { SessionLocalData } = loadModule("src/features/account/SessionLocalData.ts", {
    "@/features/search/GlobalSearchService": { GlobalSearchService: { clearCache: noOp.clearCache } },
    "@/features/preferences/ExperiencePreferences": { ExperiencePreferencesService: { invalidate: noOp.invalidate } },
    "@/features/sync/SyncPreferences": { isSyncPreferenceKey: (key: string) => key.startsWith("studyai:ai-settings") || key.startsWith("studyai:exams") },
    "@/lib/storage/StorageManager": { StorageManager: {
      setUserScope: async (owner?: string) => { database = owner ? `studyai-db:user-${owner}` : "studyai-db"; },
      put: async (_store: string, value: { key: string }) => { databaseRecords().set(value.key, value); },
      get: async (_store: string, key: string) => databaseRecords().get(key),
    } },
    "@/lib/storage/Database": { currentDatabaseName: () => database },
    "@/services/material-runtime-store": { MaterialRuntimeStore: { clear: noOp.clear } },
  }, { localStorage }) as { SessionLocalData: { suspend: (owner?: string) => Promise<void>; resume: (owner: string) => Promise<void> } };
  await SessionLocalData.suspend("A");
  expect(localStorage.getItem("studyai:exams")).toBeNull();
  database = "studyai-db:user-B";
  await SessionLocalData.resume("B");
  expect(localStorage.getItem("studyai:ai-settings")).toBeNull();
  expect(localStorage.getItem("studyai:exams")).toBeNull();
  await SessionLocalData.suspend("B");
  database = "studyai-db:user-A";
  await SessionLocalData.resume("A");
  expect(localStorage.getItem("studyai:exams")).toContain("plan-A");
});

test("API rejeita identidade de sessão ausente ou diferente do JWT", () => {
  const { requireSessionOwner } = loadModule("src/server/auth/http.ts", {
    "server-only": {},
    "next/server": { NextResponse: class {} },
    "./AuthService": { AuthService: {} },
    "@/server/security/Crypto": { constantTimeEqual: (left: string, right: string) => left === right },
  }, { Request, Response, URL, Set }) as { requireSessionOwner: (request: Request, userId: string) => void };
  expect(() => requireSessionOwner(new Request("http://local/sync"), "A")).toThrow();
  expect(() => requireSessionOwner(new Request("http://local/sync", { headers: { "x-studyai-session-user": "B" } }), "A")).toThrow();
  expect(() => requireSessionOwner(new Request("http://local/sync", { headers: { "x-studyai-session-user": "A" } }), "A")).not.toThrow();
});

test("upload pendente é abortado na troca de conta e não confirma o resultado", async () => {
  const sessionModule = loadModule("src/features/account/SessionOperationManager.ts", {}) as {
    SessionOperationManager: { activate: (id?: string) => void; beginTransition: () => void; start: () => unknown };
  };
  sessionModule.SessionOperationManager.activate("A");
  let requests = 0;
  let uploadSignal: AbortSignal | undefined;
  let completionRequests = 0;
  const fetch = (_url: string, init?: RequestInit) => {
    requests++;
    if (requests > 1) completionRequests++;
    uploadSignal = init?.signal ?? undefined;
    return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
  };
  const { CloudFileService } = loadModule("src/features/sync/CloudFileService.ts", {
    "@/features/account/AuthClient": { AuthClient: {} },
    "@/features/account/SessionOperationManager": sessionModule,
    "@/services/material-binary-storage": { MaterialBinaryStorage: {} },
  }, { fetch, document: { cookie: "studyai_csrf=test" }, btoa, Blob, File, Response, DOMException }) as {
    CloudFileService: { upload: (material: object, file: File) => Promise<string> };
  };
  const upload = CloudFileService.upload({ id: "material-A", mimeType: "text/plain" }, new File(["A"], "a.txt", { type: "text/plain" }));
  // Espera determinística: o upload precisa ter iniciado a requisição antes da troca de conta.
  for (let attempt = 0; attempt < 200 && requests === 0; attempt++) await new Promise((resolve) => setTimeout(resolve, 5));
  expect(requests, "o upload precisa iniciar a requisição antes da troca de conta").toBe(1);
  expect(uploadSignal?.aborted).toBe(false);
  sessionModule.SessionOperationManager.beginTransition();
  const message = await upload.then(() => "", (error: Error) => error.name);
  // A operação pode ser cancelada via AbortError (fetch) ou via guarda de sessão (SessionChangedError).
  expect(["AbortError", "SessionChangedError"]).toContain(message);
  // Verificação de cancelamento real: o sinal em voo foi abortado e nenhuma confirmação foi enviada.
  expect(uploadSignal?.aborted, "a requisição em voo precisa ser abortada na troca de conta").toBe(true);
  expect(completionRequests, "o upload não pode confirmar o resultado após a troca").toBe(0);
});

test("resposta atrasada de A não é aplicada depois de entrar em B", async () => {
  const { SessionOperationManager } = loadModule("src/features/account/SessionOperationManager.ts", {}) as {
    SessionOperationManager: { activate: (id?: string) => void; beginTransition: () => void; start: (id?: string) => { assertCurrent: () => void } };
  };
  SessionOperationManager.activate("A");
  const operation = SessionOperationManager.start("A");
  const applied: string[] = [];
  // A resposta só chega depois da troca de conta e ignora o sinal de abort: apenas a guarda deve impedir a aplicação.
  const delayed = new Promise<string>((resolve) => setTimeout(() => resolve("payload-de-A"), 25));
  const pipeline = (async () => {
    const response = await delayed;
    operation.assertCurrent();
    applied.push(response);
  })();
  SessionOperationManager.beginTransition();
  SessionOperationManager.activate("B");
  const errorName = await pipeline.then(() => "", (error: Error) => error.name);
  expect(errorName).toBe("SessionChangedError");
  expect(applied, "resposta atrasada de A não pode ser aplicada na sessão B").toHaveLength(0);
});

test("sincronização de A não grava resposta depois do logout", async () => {
  const sessionModule = loadModule("src/features/account/SessionOperationManager.ts", {}) as {
    SessionChangedError: new () => Error;
    SessionOperationManager: { activate: (id?: string) => void; beginTransition: () => void };
  };
  sessionModule.SessionOperationManager.activate("A");
  let transitionStarted = false;
  let writesAfterTransition = 0;
  const storage = {
    get: async () => undefined,
    getAll: async () => [],
    put: async () => { if (transitionStarted) writesAfterTransition++; },
    delete: async () => undefined,
  };
  const request = async (_url: string, init?: { operation?: { signal: AbortSignal } }) => new Promise<never>((_resolve, reject) => {
    init?.operation?.signal.addEventListener("abort", () => reject(new sessionModule.SessionChangedError()), { once: true });
  });
  const localStorage = { getItem: () => null, setItem: () => undefined };
  const { CloudSyncManager } = loadModule("src/features/sync/CloudSyncManager.ts", {
    "@/features/account/AuthClient": { AuthClient: { deviceId: () => "device", request } },
    "@/features/account/SessionOperationManager": sessionModule,
    "@/lib/storage/StorageManager": { StorageManager: storage },
    "@/lib/storage/StorageVersion": { STORAGE_MIGRATION_KEY: "migration" },
    "@/services/material-binary-storage": { MaterialBinaryStorage: { load: async () => null, remove: async () => undefined } },
    "@/services/material-runtime-store": { MaterialRuntimeStore: { remove: () => undefined } },
    "./CloudFileService": { CloudFileService: { hash: async () => "hash", upload: async () => undefined } },
    "./SyncPreferences": { syncPreferences: () => ({}), applySyncPreferences: () => undefined },
    "./types": {},
  }, { navigator: { onLine: true }, localStorage, window: { dispatchEvent: () => undefined }, CustomEvent, TextEncoder }) as {
    CloudSyncManager: { syncNow: (options: { userId: string }) => Promise<unknown> };
  };
  const sync = CloudSyncManager.syncNow({ userId: "A" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  transitionStarted = true;
  sessionModule.SessionOperationManager.beginTransition();
  const result = await sync.then(() => "", (error: Error) => error.name);
  expect(result).toBe("SessionChangedError");
  expect(writesAfterTransition).toBe(0);
});
