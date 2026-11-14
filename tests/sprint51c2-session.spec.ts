import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

test("edição iniciada por A não grava após troca para B", async () => {
  const source = readFileSync("src/features/academy/studio/service.ts", "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  let resolveRead!: (value: unknown) => void;
  const reading = new Promise((resolve) => { resolveRead = resolve; });
  let account = "A";
  let writes = 0;
  const storage = { get: () => reading, put: async () => { writes++; } };
  const sessions = { start: () => { const owner = account; return { assertCurrent: () => { if (account !== owner) throw new Error("Sessão alterada"); }, release: () => {} }; } };
  const compiled = { exports: {} as Record<string, unknown> };
  vm.runInNewContext(code, { module: compiled, exports: compiled.exports, Date, require: (id: string) => {
    if (id === "./storage") return { StudioStorage: storage };
    if (id === "@/features/account/SessionOperationManager") return { SessionOperationManager: sessions };
    return {};
  } });
  const service = compiled.exports.StudioService as { updateSection(id: string, section: string, changes: unknown, version: number): Promise<unknown> };
  const pending = service.updateSection("documento", "secao", { content: "A" }, 1);
  account = "B";
  resolveRead({ id: "documento", version: 1, documentStructure: { sections: [{ id: "secao", content: "anterior" }], metadata: {} } });
  let rejected = false;
  try { await pending; } catch { rejected = true; }
  expect(rejected).toBe(true);
  expect(writes).toBe(0);
});
