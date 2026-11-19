import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

test("Academy fornece dados válidos ao middleware antes de chamar o gerador", async () => {
  const requireModule = createRequire(__filename);
  let calls = 0;
  const dependencies: Record<string, unknown> = {
    "@/features/ai/AIErrors": { AIError: class extends Error {}, normalizeAIError: () => ({ status: 500, body: {} }) },
    "@/features/ai/AIProvider": { isAIModelPreferences: () => true, isAISelectionMode: () => true },
    "@/features/ai/AIService": { AIService: { generate: async (request: { message: string; model: string }) => { calls++; expect(request.message).toBe("prompt real"); expect(request.model).toBe("modelo"); return { text: "conteúdo", provider: "openrouter", model: "modelo" }; } } },
    "@/features/academy/services/AcademyPromptBuilder": { AcademyPromptBuilder: { build: () => ({ history: [], message: "prompt real", metrics: { promptTokens: 10 } }) } },
    "@/features/academy/validation/generation-parser": { AcademyGenerationParser: { parse: (_stage: string, text: string) => ({ text }) } },
    "@/features/academy/types": { academyContentKinds: ["material", "trail", "project"], academyGenerationStages: ["outline"], academyGenerationModes: ["standard"], academyDepths: ["basic"], academyGoals: ["learn"], academyLanguages: ["pt"], academyLevels: ["beginner"], academyStyles: ["simple"] },
    "@/server/ai/QuotaMiddleware": { withAIQuota: async (request: Request, handler: (request: Request, data: object) => Promise<Response>, prepared: { history: unknown[]; message: string }) => { expect(prepared.history).toEqual([]); expect(prepared.message).toBeTruthy(); return handler(request, {}); } },
  };
  const source = readFileSync(path.join(process.cwd(), "src/app/api/academy/generate/route.ts"), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const compiled = { exports: {} };
  vm.runInContext(js, vm.createContext({ module: compiled, exports: compiled.exports, require: (id: string) => id in dependencies ? dependencies[id] : requireModule(id), Response }));
  const post = (compiled.exports as { POST: (request: Request) => Promise<Response> }).POST;
  for (const kind of ["material", "trail", "project"]) {
    const body = { study: { id: "s", topic: "Tema", subject: "Matéria", duration: 30, level: "beginner", goal: "learn", language: "pt", depth: "basic", style: "simple" }, kind, stage: "outline", generationMode: "standard", model: "modelo" };
    const response = await post(new Request("http://localhost/api/academy/generate", { method: "POST", body: JSON.stringify(body) }));
    expect(response.status).toBe(200);
  }
  expect(calls).toBe(3);
});
