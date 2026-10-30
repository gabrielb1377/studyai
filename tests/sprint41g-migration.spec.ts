import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

test("migração não atribui dados legados sem proprietário à conta autenticada", async () => {
  const entries = new Map<string, string>([["studyai:notes", JSON.stringify([{ id: "legacy-note", content: "legado" }])], ["studyai:quizzes", JSON.stringify({ questions: [{ id: "legacy-question" }], results: [] })]]);
  const writes: Array<{ store: string; value: unknown }> = [];
  const localStorage = { getItem: (key: string) => entries.get(key) ?? null, removeItem: (key: string) => entries.delete(key) };
  const indexed = { transaction: async (_stores: string[], _mode: string, operation: (storage: object) => Promise<unknown>) => operation({ get: async () => undefined, put: async (store: string, value: unknown) => { writes.push({ store, value }); } }) };
  const deps: Record<string, unknown> = {
    "./IndexedDB": { IndexedDB: indexed },
    "./Database": { currentDatabaseName: () => "studyai-db:user-account-b" },
    "./StorageVersion": { STORAGE_DATABASE_NAME: "studyai-db", STORAGE_MIGRATION_KEY: "migration", STORAGE_SCHEMA_VERSION: 2, STORAGE_STORES: ["metadata", "notes", "quizzes"] },
  };
  const source = readFileSync(path.join(process.cwd(), "src/lib/storage/Migration.ts"), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const compiled = { exports: {} };
  const requireModule = createRequire(__filename);
  vm.runInContext(js, vm.createContext({ module: compiled, exports: compiled.exports, require: (id: string) => id in deps ? deps[id] : requireModule(id), window: { localStorage }, Date }));
  await (compiled.exports as { Migration: { run: () => Promise<void> } }).Migration.run();
  expect(writes.map((item) => item.store)).toEqual(["metadata"]);
  expect(entries.has("studyai:notes")).toBe(true);
  expect(entries.has("studyai:quizzes")).toBe(true);
});

test("dados legados podem ser recuperados no banco local de visitante", async () => {
  const entries = new Map<string, string>([["studyai:notes", JSON.stringify([{ id: "legacy-note", content: "legado" }])]]);
  const writes: Array<{ store: string; value: unknown }> = [];
  const localStorage = { getItem: (key: string) => entries.get(key) ?? null, removeItem: (key: string) => entries.delete(key) };
  const indexed = { transaction: async (_stores: string[], _mode: string, operation: (storage: object) => Promise<unknown>) => operation({ get: async () => undefined, put: async (store: string, value: unknown) => { writes.push({ store, value }); } }) };
  const deps: Record<string, unknown> = { "./IndexedDB": { IndexedDB: indexed }, "./Database": { currentDatabaseName: () => "studyai-db" }, "./StorageVersion": { STORAGE_DATABASE_NAME: "studyai-db", STORAGE_MIGRATION_KEY: "migration", STORAGE_SCHEMA_VERSION: 2, STORAGE_STORES: ["metadata", "notes", "quizzes"] } };
  const source = readFileSync(path.join(process.cwd(), "src/lib/storage/Migration.ts"), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const compiled = { exports: {} };
  const requireModule = createRequire(__filename);
  vm.runInContext(js, vm.createContext({ module: compiled, exports: compiled.exports, require: (id: string) => id in deps ? deps[id] : requireModule(id), window: { localStorage }, Date }));
  await (compiled.exports as { Migration: { run: () => Promise<void> } }).Migration.run();
  expect(writes.some((item) => item.store === "notes" && (item.value as { id?: string }).id === "legacy-note")).toBe(true);
  expect(entries.has("studyai:notes")).toBe(false);
});

test("mudança de conta durante leitura interrompe a migração antes de gravar", async () => {
  let scope = "studyai-db";
  let writes = 0;
  const indexed = { transaction: async (_stores: string[], _mode: string, operation: (storage: object) => Promise<unknown>) => operation({ get: async () => { scope = "studyai-db:user-b"; return undefined; }, put: async () => { writes++; } }) };
  const deps: Record<string, unknown> = { "./IndexedDB": { IndexedDB: indexed }, "./Database": { currentDatabaseName: () => scope }, "./StorageVersion": { STORAGE_DATABASE_NAME: "studyai-db", STORAGE_MIGRATION_KEY: "migration", STORAGE_SCHEMA_VERSION: 2, STORAGE_STORES: ["metadata"] } };
  const source = readFileSync(path.join(process.cwd(), "src/lib/storage/Migration.ts"), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const compiled = { exports: {} };
  const requireModule = createRequire(__filename);
  vm.runInContext(js, vm.createContext({ module: compiled, exports: compiled.exports, require: (id: string) => id in deps ? deps[id] : requireModule(id), window: {}, Date }));
  let failed = false;
  try { await (compiled.exports as { Migration: { run: () => Promise<void> } }).Migration.run(); } catch { failed = true; }
  expect(failed).toBe(true);
  expect(writes).toBe(0);
});
