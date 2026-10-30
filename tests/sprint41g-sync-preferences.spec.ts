import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

test("sincronização aplica apenas preferências permitidas e valores texto", () => {
  const source = readFileSync(path.join(process.cwd(), "src/features/sync/SyncPreferences.ts"), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const compiled = { exports: {} };
  vm.runInContext(js, vm.createContext({ module: compiled, exports: compiled.exports }));
  const { applySyncPreferences } = compiled.exports as { applySyncPreferences: (storage: object, data: unknown) => void };
  const values = new Map<string, string>();
  applySyncPreferences({ setItem: (key: string, value: string) => values.set(key, value) }, { "studyai:exams": "[]", "studyai:storage-scope": "user-other", "studyai:offline-session": "active", "studyai:ai-settings": { provider: "gemini" } });
  expect([...values.entries()]).toEqual([["studyai:exams", "[]"]]);
});
