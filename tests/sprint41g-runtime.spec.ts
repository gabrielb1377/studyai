import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

test("limpeza do cache de materiais revoga todos os URLs em memória", () => {
  const revoked: string[] = [];
  let next = 0;
  const source = readFileSync(path.join(process.cwd(), "src/services/material-runtime-store.ts"), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const compiled = { exports: {} };
  vm.runInContext(js, vm.createContext({ module: compiled, exports: compiled.exports, URL: { createObjectURL: () => `blob:${++next}`, revokeObjectURL: (value: string) => revoked.push(value) } }));
  const store = (compiled.exports as { MaterialRuntimeStore: { register: (id: string, file: object) => void; get: (id: string) => unknown; clear: () => void } }).MaterialRuntimeStore;
  store.register("a", {});
  store.register("b", {});
  store.clear();
  expect(revoked).toEqual(["blob:1", "blob:2"]);
  expect(store.get("a")).toBeNull();
  expect(store.get("b")).toBeNull();
});
