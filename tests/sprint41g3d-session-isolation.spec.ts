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

test.describe("Isolamento de sessão e armazenamento — Sprint 41G.3D", () => {

  test("Cenário 1: A grava dados privados; B não consegue restaurá-los", async () => {
    const localStorage = fakeLocalStorage();
    localStorage.setItem("studyai:active-session-owner", "user-a");
    localStorage.setItem("studyai:exams", "plano-de-a");

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
      SessionLocalData: { suspend: (ownerHint?: string) => Promise<void>; resume: (userId: string) => Promise<void>; clearOwner: () => void; };
    };

    await SessionLocalData.suspend("user-a");
    expect(localStorage.getItem("studyai:exams")).toBeNull();
    expect(localStorage.getItem("studyai:active-session-owner")).toBeNull();

    await SessionLocalData.resume("user-b");
    expect(localStorage.getItem("studyai:active-session-owner")).toBe("user-b");
    expect(localStorage.getItem("studyai:exams")).toBeNull();
  });

  test("Cenário 2: Logout impede acesso a dados privados da sessão anterior", async () => {
    const localStorage = fakeLocalStorage();
    localStorage.setItem("studyai:active-session-owner", "user-a");
    localStorage.setItem("studyai:exams", "plano-de-a");

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
      SessionLocalData: { suspend: (ownerHint?: string) => Promise<void>; clearOwner: () => void; };
    };

    await SessionLocalData.suspend("user-a");
    SessionLocalData.clearOwner();

    expect(localStorage.getItem("studyai:active-session-owner")).toBeNull();
    expect(localStorage.getItem("studyai:exams")).toBeNull();
  });

  test("Modo offline preserva preferências sem atribuí-las a uma conta", async () => {
    const localStorage = fakeLocalStorage();
    localStorage.setItem("studyai:offline-session", "active");
    localStorage.setItem("studyai:ai-settings", JSON.stringify({ version: 3, mode: "manual", provider: "groq", models: {} }));
    let record: unknown = null;
    const { isSyncPreferenceKey } = loadModule("src/features/sync/SyncPreferences.ts", {}) as { isSyncPreferenceKey: (key: string) => boolean };
    const StorageManager = {
      put: async (_store: string, value: unknown) => { record = value; },
      get: async () => record,
      setUserScope: async () => {},
    };
    const { SessionLocalData } = loadModule("src/features/account/SessionLocalData.ts", {
      "@/lib/storage/StorageManager": { StorageManager },
      "@/lib/storage/Database": { currentDatabaseName: () => "studyai-db" },
      "@/services/material-runtime-store": { MaterialRuntimeStore: { clear: () => {} } },
      "@/features/search/GlobalSearchService": { GlobalSearchService: { clearCache: () => {} } },
      "@/features/preferences/ExperiencePreferences": { ExperiencePreferencesService: { invalidate: () => {} } },
      "@/features/sync/SyncPreferences": { isSyncPreferenceKey },
    }, { localStorage, crypto }) as {
      SessionLocalData: {
        offlineOwnerHint: () => string | undefined;
        suspend: (ownerHint?: string) => Promise<void>;
        resumeOffline: () => Promise<void>;
        resume: (userId: string) => Promise<void>;
      };
    };

    await SessionLocalData.suspend(SessionLocalData.offlineOwnerHint());
    expect(localStorage.getItem("studyai:ai-settings")).toBeNull();
    await SessionLocalData.resumeOffline();
    expect(JSON.parse(localStorage.getItem("studyai:ai-settings") ?? "null")).toMatchObject({ provider: "groq" });

    await SessionLocalData.resume("user-b");
    expect(localStorage.getItem("studyai:ai-settings")).toBeNull();
  });

  test("Cenário 3: A→B→A invalida operações da geração antiga", () => {
    const { SessionOperationManager } = loadModule("src/features/account/SessionOperationManager.ts", {}) as {
      SessionOperationManager: { activate: (id?: string) => void; start: (id?: string) => { generation: number; signal: AbortSignal; assertCurrent: () => void; release: () => void }; };
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
    expect((error as Error).name).toBe("SessionChangedError");

    error = null;
    try { opB.assertCurrent(); } catch (e) { error = e; }
    expect(error).toBeInstanceOf(Error);

    opA2.assertCurrent();
  });

  test("Cenário 4: sessão de áudio/professor no IndexedDB é isolada por usuário", async () => {
    const storedSessionA = { id: "s-1", studyId: "st-1", topic: "Matemática", subject: "Cálculo", steps: [], currentStep: 0, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), activeSeconds: 0, lastTickAt: null, voice: "pt-BR", rate: 1, autoplay: true, narrationEnabled: true };
    const keyA = "teacher-audio-session:v1:user-a";
    const storageManagerA = {
      get: async (_store: string, key: string) => {
        if (key === keyA) return { key, value: storedSessionA, updatedAt: new Date().toISOString() };
        return null;
      },
      put: async () => {},
      delete: async () => {},
    } as { get: (store: string, key: string) => Promise<{ key: string; value: unknown; updatedAt: string } | null>; put: (store: string, record: { key: string; value: unknown; updatedAt: string }) => Promise<void>; delete: (store: string, key: string) => Promise<void>; };

    const { TeacherAudioSessionStorage } = loadModule("src/features/teacher/services/TeacherAudioSessionStorage.ts", {
      "@/features/account/SessionOperationManager": {
        SessionOperationManager: {
          current: () => ({ userId: "user-a", generation: 1, suspended: false }),
          start: () => ({ assertCurrent: () => {}, release: () => {} }),
        },
      },
      "@/lib/storage/StorageManager": {
        StorageManager: storageManagerA,
      },
    }, { window: {} }) as { TeacherAudioSessionStorage: { load: () => Promise<{ id: string; studyId: string; topic: string } | null>; save: (session: unknown) => Promise<unknown>; remove: () => Promise<void>; }; };

    const sessionA = await TeacherAudioSessionStorage.load();
    expect(sessionA?.studyId).toBe("st-1");

    const storageManagerB = {
      get: async () => null,
      put: async () => {},
      delete: async () => {},
    } as { get: (store: string, key: string) => Promise<{ key: string; value: unknown; updatedAt: string } | null>; put: (store: string, record: { key: string; value: unknown; updatedAt: string }) => Promise<void>; delete: (store: string, key: string) => Promise<void>; };

    const { TeacherAudioSessionStorage: StorageB } = loadModule("src/features/teacher/services/TeacherAudioSessionStorage.ts", {
      "@/features/account/SessionOperationManager": {
        SessionOperationManager: {
          current: () => ({ userId: "user-b", generation: 1, suspended: false }),
          start: () => ({ assertCurrent: () => {}, release: () => {} }),
        },
      },
      "@/lib/storage/StorageManager": {
        StorageManager: storageManagerB,
      },
    }, { window: {} }) as { TeacherAudioSessionStorage: { load: () => Promise<{ id: string; studyId: string; topic: string } | null>; save: (session: unknown) => Promise<unknown>; remove: () => Promise<void>; }; };

    const sessionB = await StorageB.load();
    expect(sessionB).toBeNull();
  });

  test("Cenário 5: Dados legados sem proprietário não são restaurados automaticamente", async () => {
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

  test("Cenário 6: Falha de limpeza não expõe dados à próxima conta", async () => {
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

    expect(localStorage.getItem("studyai:exams")).toBeNull();

    await SessionLocalData.resume("user-b");
    expect(localStorage.getItem("studyai:exams")).toBeNull();
  });

  test("Cenário 7: Dados públicos continuam funcionando", async () => {
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

  test("Cenário 8: requireSessionOwner exige proprietário para arquivos privados", async () => {
    const { requireSessionOwner } = loadModule("src/server/auth/http.ts", {
      "server-only": {},
      "next/server": { NextResponse: { json: (data: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body: JSON.stringify(data) }) } },
      "./AuthService": { AuthService: { access: () => ({ sub: "user-a" }) } },
      "@/server/security/Crypto": { constantTimeEqual: (left: string, right: string) => left === right },
    }) as { requireSessionOwner: (request: Request, userId: string) => void; };

    requireSessionOwner(new Request("http://local/api/files/1", { headers: { "x-studyai-session-user": "user-a" } }), "user-a");

    let error: unknown = null;
    try { requireSessionOwner(new Request("http://local/api/files/1", { headers: { "x-studyai-session-user": "user-b" } }), "user-a"); } catch (e) { error = e; }
    expect(error).toBeInstanceOf(Response);
    expect((error as Response).status).toBe(409);
  });

  test("Cenário 9: resultado atrasado da sessão de áudio de A não é aplicado em B", async () => {
    let resolveRead: ((value: unknown) => void) | undefined;
    const delayedRead = new Promise<unknown>((resolve) => { resolveRead = resolve; });
    const sessionA = { id: "s-delayed", studyId: "study-a", topic: "Álgebra", subject: "Matemática", steps: [], currentStep: 0, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), activeSeconds: 0, lastTickAt: null, voice: "pt-BR", rate: 1, autoplay: true, narrationEnabled: true };
    const { SessionOperationManager } = loadModule("src/features/account/SessionOperationManager.ts", {}) as {
      SessionOperationManager: { activate: (id?: string) => void };
    };
    SessionOperationManager.activate("user-a");

    const { TeacherAudioSessionStorage } = loadModule("src/features/teacher/services/TeacherAudioSessionStorage.ts", {
      "@/features/account/SessionOperationManager": { SessionOperationManager },
      "@/lib/storage/StorageManager": {
        StorageManager: {
          get: async () => delayedRead,
          put: async () => {},
          delete: async () => {},
        },
      },
    }, { window: {} }) as { TeacherAudioSessionStorage: { load: () => Promise<unknown> } };

    const pendingLoad = TeacherAudioSessionStorage.load();
    SessionOperationManager.activate("user-b");
    resolveRead?.({ key: "teacher-audio-session:v1:user-a", value: sessionA, updatedAt: new Date().toISOString() });

    expect(await pendingLoad).toBeNull();
  });

  test("Cenário 10: sessão de áudio legada permanece recuperável no banco escopado", async () => {
    const legacySession = { id: "s-legacy", studyId: "study-legacy", topic: "Geometria", subject: "Matemática", steps: [], currentStep: 0, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), activeSeconds: 0, lastTickAt: null, voice: "pt-BR", rate: 1, autoplay: true, narrationEnabled: true };
    const { SessionOperationManager } = loadModule("src/features/account/SessionOperationManager.ts", {}) as {
      SessionOperationManager: { activate: (id?: string) => void };
    };
    SessionOperationManager.activate("user-a");

    const { TeacherAudioSessionStorage } = loadModule("src/features/teacher/services/TeacherAudioSessionStorage.ts", {
      "@/features/account/SessionOperationManager": { SessionOperationManager },
      "@/lib/storage/StorageManager": {
        StorageManager: {
          get: async (_store: string, key: string) => key === "teacher-audio-session:v1" ? { key, value: legacySession, updatedAt: new Date().toISOString() } : null,
          put: async () => {},
          delete: async () => {},
        },
      },
    }, { window: {} }) as { TeacherAudioSessionStorage: { load: () => Promise<{ studyId: string } | null> } };

    expect(await TeacherAudioSessionStorage.load()).toMatchObject({ studyId: "study-legacy" });
  });

});
