import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

function loadModule(file: string, dependencies: Record<string, unknown>) {
  const source = readFileSync(path.join(process.cwd(), file), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const compiled = { exports: {} };
  vm.runInNewContext(js, { module: compiled, exports: compiled.exports, require: (id: string) => dependencies[id], window: {}, DOMException, Error });
  return compiled.exports;
}

test("troca A → B → A durante a inicialização impede gravação tardia", async () => {
  let generation = 0;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let transactions = 0;
  const dependencies = {
    "./Database": { currentDatabaseGeneration: () => generation },
    "./IndexedDB": { IndexedDB: { transaction: async () => { transactions++; } } },
    "./Migration": { Migration: { run: () => pending } },
    "@/services/material-runtime-store": { MaterialRuntimeStore: {} },
    "./StorageVersion": {},
  };
  const { StorageManager } = loadModule("src/lib/storage/StorageManager.ts", dependencies) as { StorageManager: { put: (store: string, value: unknown) => Promise<unknown> } };
  const write = StorageManager.put("notes", { id: "a" });
  generation += 2;
  release();
  const result = await write.then(() => "", (error: Error) => error.message);
  expect(result).toMatch(/conta mudou/);
  expect(transactions).toBe(0);
});

test("troca de conta durante abertura do IndexedDB impede iniciar transação", async () => {
  let generation = 0;
  let release!: (database: unknown) => void;
  const pending = new Promise((resolve) => { release = resolve; });
  let transactions = 0;
  const { IndexedDB } = loadModule("src/lib/storage/IndexedDB.ts", {
    "./Database": { currentDatabaseGeneration: () => generation, openStudyDatabase: () => pending },
  }) as { IndexedDB: { transaction: (stores: string[], mode: string, operation: () => Promise<void>) => Promise<unknown> } };
  const write = IndexedDB.transaction(["notes"], "readwrite", async () => undefined);
  generation++;
  release({ transaction: () => { transactions++; } });
  const result = await write.then(() => "", (error: Error) => error.message);
  expect(result).toMatch(/conta mudou/);
  expect(transactions).toBe(0);
});

test("troca de conta invalida resultado e tenta reverter transação em andamento", async () => {
  let generation = 0;
  let release!: () => void;
  let started!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const transactionStarted = new Promise<void>((resolve) => { started = resolve; });
  let aborted = false;
  const transaction = { oncomplete: () => {}, onabort: () => {}, onerror: () => {}, error: null, abort() { aborted = true; this.onabort(); } };
  const { IndexedDB } = loadModule("src/lib/storage/IndexedDB.ts", {
    "./Database": { currentDatabaseGeneration: () => generation, openStudyDatabase: async () => ({ transaction: () => transaction }) },
  }) as { IndexedDB: { transaction: (stores: string[], mode: string, operation: () => Promise<void>) => Promise<unknown> } };
  const write = IndexedDB.transaction(["notes"], "readwrite", async () => { started(); await pending; });
  await transactionStarted;
  generation++;
  release();
  const result = await write.then(() => "", (error: Error) => error.message);
  expect(result).toMatch(/conta mudou/);
  expect(aborted).toBe(true);
});
