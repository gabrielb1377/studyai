import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

test("Lab usa o provider escolhido e não troca de provider após 429", async () => {
  const requireModule = createRequire(__filename);
  const attempts: string[] = [];
  const deps: Record<string, unknown> = {
    "@/features/ai/AIErrors": { normalizeAIError: () => ({ status: 429, body: { code: "RATE_LIMIT" } }) },
    "@/features/ai/AIService": { AIService: { generate: async (request: { provider: string }) => { attempts.push(request.provider); throw new Error("limit"); } } },
    "@/features/lab/services/LabPromptBuilder": { LabPromptBuilder: { review: () => "review" } },
    "@/features/lab/validators/lab-validation": { isLabReviewRequest: () => true },
    "@/features/ai/AIProvider": { isAIProviderId: () => true, isAISelectionMode: () => true, isAIModelPreferences: () => true },
    "@/server/ai/QuotaMiddleware": { withAIQuota: async (request: Request, handler: (request: Request, data: object) => Promise<Response>, prepared: { history: unknown[]; message: string }) => { expect(prepared.history).toEqual([]); expect(prepared.message).toBeTruthy(); return handler(request, {}); } },
  };
  const source = readFileSync(path.join(process.cwd(), "src/app/api/lab/review/route.ts"), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const compiled = { exports: {} };
  vm.runInContext(js, vm.createContext({ module: compiled, exports: compiled.exports, require: (id: string) => id in deps ? deps[id] : requireModule(id), Response }));
  const post = (compiled.exports as { POST: (request: Request) => Promise<Response> }).POST;
  const response = await post(new Request("http://localhost/api/lab/review", { method: "POST", body: JSON.stringify({ request: {}, provider: "gemini", mode: "manual" }) }));
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("30");
  expect(attempts).toEqual(["gemini"]);
});
