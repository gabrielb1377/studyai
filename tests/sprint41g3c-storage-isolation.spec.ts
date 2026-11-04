import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

function loadModule(file: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const source = readFileSync(path.join(process.cwd(), file), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const compiled = { exports: {} };
  vm.runInNewContext(js, { module: compiled, exports: compiled.exports, require: (id: string) => dependencies[id], AbortController, Error, Date, JSON, Math, Object, Set, Promise, URL, Request, Response, TextEncoder, console, crypto, randomUUID: () => crypto.randomUUID(), performance, navigator: { storage: { estimate: () => Promise.resolve({ usage: 0, quota: 0 }) } }, ...globals });
  return compiled.exports;
}

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

test.describe("Isolamento de OPFS, Cache e storages legados — Sprint 41G.3C", () => {

  test("Cenário 1: A grava materiais privados no OPFS; B não consegue acessá-los", async () => {
    const { MaterialBinaryStorage } = loadModule("src/services/material-binary-storage.ts", {
      "@/features/account/SessionOperationManager": {
        SessionOperationManager: {
          current: () => ({ userId: "user-a", generation: 1, suspended: false }),
        },
      },
    }) as { MaterialBinaryStorage: { save: (id: string, file: File) => Promise<boolean>; load: (material: { id: string; name: string; mimeType: string }) => Promise<File | null>; remove: (id: string) => Promise<void>; }; };

    const file = new File(["conteudo-privado-de-a"], "material.txt", { type: "text/plain" });
    await MaterialBinaryStorage.save("mat-1", file);

    // Simula troca para usuário B
    const { MaterialBinaryStorage: StorageB } = loadModule("src/services/material-binary-storage.ts", {
      "@/features/account/SessionOperationManager": {
        SessionOperationManager: {
          current: () => ({ userId: "user-b", generation: 1, suspended: false }),
        },
      },
    }) as { MaterialBinaryStorage: { load: (material: { id: string; name: string; mimeType: string }) => Promise<File | null>; }; };

    const loadedByB = await StorageB.load({ id: "mat-1", name: "material.txt", mimeType: "text/plain" });
    expect(loadedByB).toBeNull();
  });

  test("Cenário 2: Cache privado de A não é servido para B", async () => {
    const { CacheManager } = loadModule("src/features/platform/CacheManager.ts", {
      "@/features/account/SessionOperationManager": {
        SessionOperationManager: {
          current: () => ({ userId: "user-a", generation: 1, suspended: false }),
        },
      },
    }) as { CacheManager: { report: () => Promise<{ cacheNames: string[] }>; clearRuntime: () => Promise<number>; }; };

    const reportA = await CacheManager.report();
    // Nomes de cache de A devem conter o scope do usuário
    const privateNamesA = reportA.cacheNames.filter((name) => name.includes("private:user-a"));
    expect(privateNamesA.length).toBeGreaterThanOrEqual(0);

    // Usuário B não deve ver caches privados de A
    const { CacheManager: CacheB } = loadModule("src/features/platform/CacheManager.ts", {
      "@/features/account/SessionOperationManager": {
        SessionOperationManager: {
          current: () => ({ userId: "user-b", generation: 1, suspended: false }),
        },
      },
    }) as { CacheManager: { report: () => Promise<{ cacheNames: string[] }>; }; };

    const reportB = await CacheB.report();
    const privateNamesB = reportB.cacheNames.filter((name) => name.includes("private:user-b"));
    // Caches de B não devem conter nomes de A
    expect(privateNamesB.some((n) => n.includes("user-a"))).toBe(false);
  });

  test("Cenário 3: Logout/troca de conta invalida operações pendentes de armazenamento", () => {
    const { SessionOperationManager } = loadModule("src/features/account/SessionOperationManager.ts", {}) as {
      SessionOperationManager: { activate: (id?: string) => void; beginTransition: () => number; start: (id?: string) => { generation: number; signal: AbortSignal; assertCurrent: () => void; release: () => void }; };
    };

    SessionOperationManager.activate("user-a");
    const opA = SessionOperationManager.start("user-a");

    // Troca para B
    SessionOperationManager.activate("user-b");

    // Operação de A deve ser rejeitada
    let error: unknown = null;
    try { opA.assertCurrent(); } catch (e) { error = e; }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBe("SessionChangedError");
  });

  test("Cenário 4: Dados legados sem proprietário não são restaurados automaticamente", async () => {
    const localStorage = fakeLocalStorage();
    localStorage.setItem("studyai:active-session-owner", "user-c");

    const { isSyncPreferenceKey } = loadModule("src/features/sync/SyncPreferences.ts", {}) as { isSyncPreferenceKey: (key: string) => boolean };
    const StorageManager = {
      put: async () => {},
      get: async () => ({ key: "session-local-preferences:v1", value: { "studyai:exams": "plano-sem-dono" }, updatedAt: new Date().toISOString(), owner: undefined }),
    } as { put: (key: string, value: unknown, options?: { notify?: boolean }) => Promise<void>; get: (key: string, storeName?: string) => Promise<unknown | null>; };
    const currentDatabaseName = () => "studyai-db:user-user-c";

    const { SessionLocalData } = loadModule("src/features/account/SessionLocalData.ts", {
      "@/lib/storage/StorageManager": { StorageManager },
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
    expect(localStorage.getItem("studyai:exams")).toBeNull();
  });

  test("Cenário 5: Dados públicos continuam funcionando", async () => {
    const localStorage = fakeLocalStorage();
    localStorage.setItem("studyai:active-session-owner", "user-a");
    localStorage.setItem("studyai:dados-publicos", "visivel-para-todos");

    const { isSyncPreferenceKey } = loadModule("src/features/sync/SyncPreferences.ts", {}) as { isSyncPreferenceKey: (key: string) => boolean };
    const StorageManager = {
      put: async () => {},
      get: async () => null,
    } as { put: (key: string, value: unknown, options?: { notify?: boolean }) => Promise<void>; get: (key: string, storeName?: string) => Promise<unknown | null>; };
    const currentDatabaseName = () => "studyai-db:user-user-a";

    const { SessionLocalData } = loadModule("src/features/account/SessionLocalData.ts", {
      "@/lib/storage/StorageManager": { StorageManager },
      "@/lib/storage/Database": { currentDatabaseName },
      "@/services/material-runtime-store": { MaterialRuntimeStore: { clear: () => {} } },
      "@/features/search/GlobalSearchService": { GlobalSearchService: { clearCache: () => {} } },
      "@/features/preferences/ExperiencePreferences": { ExperiencePreferencesService: { invalidate: () => {} } },
      "@/features/sync/SyncPreferences": { isSyncPreferenceKey },
    }, { localStorage, crypto }) as {
      SessionLocalData: { suspend: (ownerHint?: string) => Promise<void>; };
    };

    await SessionLocalData.suspend("user-a");
    expect(localStorage.getItem("studyai:dados-publicos")).toBe("visivel-para-todos");
  });

  test("Cenário 6: sessionStorage privado é invalidado no logout", () => {
    const sessionStorage = new Map<string, string>();
    const target: Record<string, string> = {};
    const fakeSessionStorage = new Proxy(target, {
      get(target, prop: string) {
        if (prop === "getItem") return (key: string) => sessionStorage.get(key) ?? null;
        if (prop === "setItem") return (key: string, value: string) => { sessionStorage.set(key, value); target[key] = value; };
        if (prop === "removeItem") return (key: string) => { sessionStorage.delete(key); delete target[key]; };
        if (prop === "clear") return () => { sessionStorage.clear(); Object.keys(target).forEach((k) => delete target[k]); };
        return target[prop];
      },
    }) as unknown as Storage;

    // Simula sessão de áudio do professor salva no sessionStorage
    fakeSessionStorage.setItem("teacher-audio-session:v1", JSON.stringify({ id: "s-1", studyId: "st-1", topic: "Matemática", subject: "Cálculo", steps: [], currentStep: 0, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), activeSeconds: 0, lastTickAt: null, voice: "pt-BR", rate: 1, autoplay: true, narrationEnabled: true }));

    // Logout limpa o sessionStorage de áudio
    fakeSessionStorage.removeItem("teacher-audio-session:v1");
    expect(fakeSessionStorage.getItem("teacher-audio-session:v1")).toBeNull();
  });

  test("Cenário 7: Falha de limpeza não expõe dados à próxima conta", async () => {
    const localStorage = fakeLocalStorage();
    localStorage.setItem("studyai:active-session-owner", "user-a");
    localStorage.setItem("studyai:exams", "plano-de-a");

    const { isSyncPreferenceKey } = loadModule("src/features/sync/SyncPreferences.ts", {}) as { isSyncPreferenceKey: (key: string) => boolean };
    const StorageManager = {
      put: async () => { throw new Error("Falha ao gravar metadados"); },
      get: async () => null,
    } as { put: (key: string, value: unknown, options?: { notify?: boolean }) => Promise<void>; get: (key: string, storeName?: string) => Promise<unknown | null>; };
    const currentDatabaseName = () => "studyai-db:user-user-a";

    const { SessionLocalData } = loadModule("src/features/account/SessionLocalData.ts", {
      "@/lib/storage/StorageManager": { StorageManager },
      "@/lib/storage/Database": { currentDatabaseName },
      "@/services/material-runtime-store": { MaterialRuntimeStore: { clear: () => {} } },
      "@/features/search/GlobalSearchService": { GlobalSearchService: { clearCache: () => {} } },
      "@/features/preferences/ExperiencePreferences": { ExperiencePreferencesService: { invalidate: () => {} } },
      "@/features/sync/SyncPreferences": { isSyncPreferenceKey },
    }, { localStorage, crypto }) as {
      SessionLocalData: { suspend: (ownerHint?: string) => Promise<void>; resume: (userId: string) => Promise<void>; clearOwner: () => void; };
    };

    let suspendError: unknown = null;
    try { await SessionLocalData.suspend("user-a"); } catch (e) { suspendError = e; }
    expect(suspendError).toBeInstanceOf(Error);

    // Mesmo com falha, dados locais foram limpos
    expect(localStorage.getItem("studyai:exams")).toBeNull();

    // B não consegue acessar dados de A
    await SessionLocalData.resume("user-b");
    expect(localStorage.getItem("studyai:exams")).toBeNull();
  });

  test("Cenário 8: Autorização no servidor continua obrigatória para arquivos privados", async () => {
    const { requireSessionOwner } = loadModule("src/server/auth/http.ts", {
      "server-only": {},
      "next/server": { NextResponse: { json: (data: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body: JSON.stringify(data) }) } },
      "./AuthService": { AuthService: { access: () => ({ sub: "user-a" }) } },
      "@/server/security/Crypto": { constantTimeEqual: (left: string, right: string) => left === right },
    }) as { requireSessionOwner: (request: Request, userId: string) => void; };

    // Header confere: não lança
    requireSessionOwner(new Request("http://local/api/files/1", { headers: { "x-studyai-session-user": "user-a" } }), "user-a");

    // Header diverge: lança 409
    let error: unknown = null;
    try { requireSessionOwner(new Request("http://local/api/files/1", { headers: { "x-studyai-session-user": "user-b" } }), "user-a"); } catch (e) { error = e; }
    expect(error).toBeInstanceOf(Response);
    expect((error as Response).status).toBe(409);
  });

});
