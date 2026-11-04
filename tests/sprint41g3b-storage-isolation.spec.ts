import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

function loadModule(file: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const source = readFileSync(path.join(process.cwd(), file), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const compiled = { exports: {} };
  vm.runInNewContext(js, { module: compiled, exports: compiled.exports, require: (id: string) => dependencies[id], AbortController, Error, Date, JSON, Math, Object, Set, Promise, URL, Request, Response, TextEncoder, console, crypto, randomUUID: () => crypto.randomUUID(), performance, ...globals });
  return compiled.exports;
}

type FakeStorageManager = {
  put: (key: string, value: unknown, options?: { notify?: boolean }) => Promise<void>;
  get: (key: string, storeName?: string) => Promise<unknown | null>;
};

function fakeLocalStorage() {
  const store = new Map<string, string>();
  const target: Record<string, string> = {};
  return new Proxy(target, {
    get(target, prop: string) {
      if (prop === "getItem") return (key: string) => store.get(key) ?? null;
      if (prop === "setItem") return (key: string, value: string) => { store.set(key, value); target[key] = value; };
      if (prop === "removeItem") return (key: string) => { store.delete(key); delete target[key]; };
      if (prop === "clear") return () => { store.clear(); Object.keys(target).forEach((k) => delete target[k]); };
      if (prop === "length") return store.size;
      if (prop === "key") return (index: number) => [...store.keys()][index] ?? null;
      return target[prop];
    },
    ownKeys() {
      return Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor() {
      return { enumerable: true, configurable: true };
    },
  }) as unknown as Storage;
}

test.describe("Isolamento do armazenamento local — Sprint 41G.3B", () => {

  test("Cenário 1: Conta A salva dados privados; conta B não consegue restaurá-los", async () => {
    const localStorage = fakeLocalStorage();
    localStorage.setItem("studyai:active-session-owner", "user-a");
    localStorage.setItem("studyai:exams", "plano-de-a");
    localStorage.setItem("studyai:ai-settings", "config-de-a");

    const { isSyncPreferenceKey } = loadModule("src/features/sync/SyncPreferences.ts", {}) as { isSyncPreferenceKey: (key: string) => boolean };
    const storageManager: FakeStorageManager = {
      put: async () => {},
      get: async () => null,
    };
    const currentDatabaseName = () => "studyai-db:user-user-a";

    const { SessionLocalData } = loadModule("src/features/account/SessionLocalData.ts", {
      "@/lib/storage/StorageManager": { StorageManager: storageManager },
      "@/lib/storage/Database": { currentDatabaseName },
      "@/services/material-runtime-store": { MaterialRuntimeStore: { clear: () => {} } },
      "@/features/search/GlobalSearchService": { GlobalSearchService: { clearCache: () => {} } },
      "@/features/preferences/ExperiencePreferences": { ExperiencePreferencesService: { invalidate: () => {} } },
      "@/features/sync/SyncPreferences": { isSyncPreferenceKey },
    }, { localStorage, crypto }) as {
      SessionLocalData: { suspend: (ownerHint?: string) => Promise<void>; resume: (userId: string) => Promise<void>; clearOwner: () => void; };
    };

    // A suspende e salva seus dados privados
    await SessionLocalData.suspend("user-a");
    expect(localStorage.getItem("studyai:exams")).toBeNull(); // limpo após suspend
    expect(localStorage.getItem("studyai:active-session-owner")).toBeNull();

    // B tenta restaurar: não há registro de B, então nada deve ser restaurado
    await SessionLocalData.resume("user-b");
    expect(localStorage.getItem("studyai:active-session-owner")).toBe("user-b");
    expect(localStorage.getItem("studyai:exams")).toBeNull(); // dados de A não restaurados para B
    expect(localStorage.getItem("studyai:ai-settings")).toBeNull();
  });

  test("Cenário 2: Logout impede acesso aos dados privados da sessão anterior", async () => {
    const localStorage = fakeLocalStorage();
    localStorage.setItem("studyai:active-session-owner", "user-a");
    localStorage.setItem("studyai:exams", "plano-de-a");

    const { isSyncPreferenceKey } = loadModule("src/features/sync/SyncPreferences.ts", {}) as { isSyncPreferenceKey: (key: string) => boolean };
    const storageManager: FakeStorageManager = {
      put: async () => {},
      get: async () => null,
    };
    const currentDatabaseName = () => "studyai-db:user-user-a";

    const { SessionLocalData } = loadModule("src/features/account/SessionLocalData.ts", {
      "@/lib/storage/StorageManager": { StorageManager: storageManager },
      "@/lib/storage/Database": { currentDatabaseName },
      "@/services/material-runtime-store": { MaterialRuntimeStore: { clear: () => {} } },
      "@/features/search/GlobalSearchService": { GlobalSearchService: { clearCache: () => {} } },
      "@/features/preferences/ExperiencePreferences": { ExperiencePreferencesService: { invalidate: () => {} } },
      "@/features/sync/SyncPreferences": { isSyncPreferenceKey },
    }, { localStorage, crypto }) as {
      SessionLocalData: { suspend: (ownerHint?: string) => Promise<void>; clearOwner: () => void; };
    };

    await SessionLocalData.suspend("user-a");
    // Logout: limpa proprietário sem restaurar nada
    SessionLocalData.clearOwner();

    expect(localStorage.getItem("studyai:active-session-owner")).toBeNull();
    expect(localStorage.getItem("studyai:exams")).toBeNull();
  });

  test("Cenário 3: A → B → A invalida operações da geração antiga", () => {
    const { SessionOperationManager } = loadModule("src/features/account/SessionOperationManager.ts", {}) as {
      SessionOperationManager: { activate: (id?: string) => void; start: (id?: string) => { generation: number; signal: AbortSignal; assertCurrent: () => void; release: () => void }; };
    };

    SessionOperationManager.activate("user-a");
    const opA1 = SessionOperationManager.start("user-a");

    SessionOperationManager.activate("user-b");
    const opB = SessionOperationManager.start("user-b");

    SessionOperationManager.activate("user-a");
    const opA2 = SessionOperationManager.start("user-a");

    // Operação antiga de A (geração anterior) deve ser rejeitada
    let error: unknown = null;
    try { opA1.assertCurrent(); } catch (e) { error = e; }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBe("SessionChangedError");

    // Operação de B rejeitada na sessão de A
    error = null;
    try { opB.assertCurrent(); } catch (e) { error = e; }
    expect(error).toBeInstanceOf(Error);

    // Operação atual de A é aceita
    opA2.assertCurrent(); // não deve lançar
  });

  test("Cenário 4: Dados sem proprietário conhecido não são restaurados automaticamente", async () => {
    const localStorage = fakeLocalStorage();
    localStorage.setItem("studyai:active-session-owner", "user-c");

    const { isSyncPreferenceKey } = loadModule("src/features/sync/SyncPreferences.ts", {}) as { isSyncPreferenceKey: (key: string) => boolean };
    const storageManager: FakeStorageManager = {
      put: async () => {},
      get: async () => ({ key: "session-local-preferences:v1", value: { "studyai:exams": "plano-sem-dono" }, updatedAt: new Date().toISOString(), owner: undefined }),
    };
    const currentDatabaseName = () => "studyai-db:user-user-c";

    const { SessionLocalData } = loadModule("src/features/account/SessionLocalData.ts", {
      "@/lib/storage/StorageManager": { StorageManager: storageManager },
      "@/lib/storage/Database": { currentDatabaseName },
      "@/services/material-runtime-store": { MaterialRuntimeStore: { clear: () => {} } },
      "@/features/search/GlobalSearchService": { GlobalSearchService: { clearCache: () => {} } },
      "@/features/preferences/ExperiencePreferences": { ExperiencePreferencesService: { invalidate: () => {} } },
      "@/features/sync/SyncPreferences": { isSyncPreferenceKey },
    }, { localStorage, crypto }) as {
      SessionLocalData: { resume: (userId: string) => Promise<void>; };
    };

    await SessionLocalData.resume("user-c");

    expect(localStorage.getItem("studyai:active-session-owner")).toBe("user-c");
    // Dados sem dono (owner: undefined) não devem ser restaurados para user-c
    expect(localStorage.getItem("studyai:exams")).toBeNull();
  });

  test("Cenário 5: requireSessionOwner rejeita header divergente (isolamento de servidor)", async () => {
    const { requireSessionOwner } = loadModule("src/server/auth/http.ts", {
      "server-only": {},
      "next/server": { NextResponse: { json: (data: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body: JSON.stringify(data) }) } },
      "./AuthService": { AuthService: { access: () => ({ sub: "user-a" }) } },
      "@/server/security/Crypto": { constantTimeEqual: (left: string, right: string) => left === right },
    }) as { requireSessionOwner: (request: Request, userId: string) => void; };

    // Header confere: não lança
    requireSessionOwner(new Request("http://local/api/x", { headers: { "x-studyai-session-user": "user-a" } }), "user-a");

    // Header diverge: lança 409
    let error: unknown = null;
    try { requireSessionOwner(new Request("http://local/api/x", { headers: { "x-studyai-session-user": "user-b" } }), "user-a"); } catch (e) { error = e; }
    expect(error).toBeInstanceOf(Response);
    expect((error as Response).status).toBe(409);
  });

  test("Cenário 6: Upload/sync pendente é rejeitado quando sessão muda", () => {
    const { SessionOperationManager } = loadModule("src/features/account/SessionOperationManager.ts", {}) as {
      SessionOperationManager: { activate: (id?: string) => void; start: (id?: string) => { generation: number; signal: AbortSignal; assertCurrent: () => void; release: () => void }; };
    };

    SessionOperationManager.activate("user-a");
    const opA = SessionOperationManager.start("user-a");

    // Troca para B enquanto operação de A está pendente
    SessionOperationManager.activate("user-b");

    // A operação de A deve ser rejeitada (sessão mudou)
    let error: unknown = null;
    try { opA.assertCurrent(); } catch (e) { error = e; }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBe("SessionChangedError");
  });

  test("Cenário 7: Falha de limpeza não permite exposição dos dados à próxima conta", async () => {
    const localStorage = fakeLocalStorage();
    localStorage.setItem("studyai:active-session-owner", "user-a");
    localStorage.setItem("studyai:exams", "plano-de-a");

    const { isSyncPreferenceKey } = loadModule("src/features/sync/SyncPreferences.ts", {}) as { isSyncPreferenceKey: (key: string) => boolean };
    const storageManager: FakeStorageManager = {
      put: async () => { throw new Error("Falha ao salvar metadados"); },
      get: async () => null,
    };
    const currentDatabaseName = () => "studyai-db:user-user-a";

    const { SessionLocalData } = loadModule("src/features/account/SessionLocalData.ts", {
      "@/lib/storage/StorageManager": { StorageManager: storageManager },
      "@/lib/storage/Database": { currentDatabaseName },
      "@/services/material-runtime-store": { MaterialRuntimeStore: { clear: () => {} } },
      "@/features/search/GlobalSearchService": { GlobalSearchService: { clearCache: () => {} } },
      "@/features/preferences/ExperiencePreferences": { ExperiencePreferencesService: { invalidate: () => {} } },
      "@/features/sync/SyncPreferences": { isSyncPreferenceKey },
    }, { localStorage, crypto }) as {
      SessionLocalData: { suspend: (ownerHint?: string) => Promise<void>; resume: (userId: string) => Promise<void>; clearOwner: () => void; };
    };

    // Suspend falha ao gravar metadados, mas clearActiveData já removeu os dados locais
    let suspendError: unknown = null;
    try { await SessionLocalData.suspend("user-a"); } catch (e) { suspendError = e; }
    expect(suspendError).toBeInstanceOf(Error);

    // Mesmo com falha, dados locais foram limpos
    expect(localStorage.getItem("studyai:exams")).toBeNull();

    // B não consegue acessar dados de A
    await SessionLocalData.resume("user-b");
    expect(localStorage.getItem("studyai:exams")).toBeNull();
  });

  test("Cenário 8: Dados públicos continuam funcionando normalmente", async () => {
    const localStorage = fakeLocalStorage();
    localStorage.setItem("studyai:active-session-owner", "user-a");

    // Dados não privados não são tocados por SessionLocalData
    localStorage.setItem("studyai:dados-publicos", "visivel-para-todos");

    const { isSyncPreferenceKey } = loadModule("src/features/sync/SyncPreferences.ts", {}) as { isSyncPreferenceKey: (key: string) => boolean };
    const storageManager: FakeStorageManager = {
      put: async () => {},
      get: async () => null,
    };
    const currentDatabaseName = () => "studyai-db:user-user-a";

    const { SessionLocalData } = loadModule("src/features/account/SessionLocalData.ts", {
      "@/lib/storage/StorageManager": { StorageManager: storageManager },
      "@/lib/storage/Database": { currentDatabaseName },
      "@/services/material-runtime-store": { MaterialRuntimeStore: { clear: () => {} } },
      "@/features/search/GlobalSearchService": { GlobalSearchService: { clearCache: () => {} } },
      "@/features/preferences/ExperiencePreferences": { ExperiencePreferencesService: { invalidate: () => {} } },
      "@/features/sync/SyncPreferences": { isSyncPreferenceKey },
    }, { localStorage, crypto }) as {
      SessionLocalData: { suspend: (ownerHint?: string) => Promise<void>; };
    };

    await SessionLocalData.suspend("user-a");

    // Dados públicos permanecem intactos
    expect(localStorage.getItem("studyai:dados-publicos")).toBe("visivel-para-todos");
  });

});
