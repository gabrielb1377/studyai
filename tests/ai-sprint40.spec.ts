import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const testRequire = createRequire(__filename);

for (const kind of ["flashcards", "quiz"] as const) {
  test(`${kind} valida entrada e usa o prompt e modelo escolhidos`, async () => {
    let called = 0;
    let invalidResponse = false;
    const result = kind === "flashcards"
      ? [{ question: "Pergunta", answer: "Resposta", difficulty: "easy" }]
      : Array.from({ length: 5 }, () => ({ question: "Pergunta", alternatives: ["a", "b", "c", "d"], correctAnswer: 1, explanation: "Explicação", difficulty: "easy" }));
    const dependencies: Record<string, unknown> = {
      "@/features/ai/AIService": { AIService: { generate: async (request: { model: string; message: string }) => { called++; expect(request.model).toBe("chosen-model"); expect(request.message).toContain("PROMPT"); return { text: invalidResponse ? "[]" : JSON.stringify(result) }; } } },
      "@/server/ai/ApiKeyService": {}, "@/server/auth/http": {},
      "@/features/ai/AIProvider": { isAIModelPreferences: () => true, isAIProviderId: () => true, isAISelectionMode: () => true },
      "@/features/ai/PromptBuilder": { PromptBuilder: { flashcards: () => "PROMPT flashcards", quiz: () => "PROMPT quiz" } },
      "@/features/retrieval/retrieval-validation": { isRetrievedChunk: () => true },
      "@/features/ai/AIErrors": { normalizeAIError: () => ({ status: 500, body: { error: "erro" } }) },
      "@/server/ai/QuotaMiddleware": { withAIQuota: async (request: Request, handler: (request: Request, data: object) => Promise<Response>, prepared: { history: unknown[]; message: string }) => handler(request, { ...prepared, model: "chosen-model", provider: "gemini" }) },
    };
    const source = readFileSync(path.join(process.cwd(), `src/app/api/tutor/${kind}/route.ts`), "utf8");
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const compiled = { exports: {} };
    vm.runInContext(js, vm.createContext({ module: compiled, exports: compiled.exports, require: (id: string) => id in dependencies ? dependencies[id] : testRequire(id), Response }));
    const post = (compiled.exports as { POST: (request: Request) => Promise<Response> }).POST;
    const send = (body: object) => post(new Request(`http://localhost/api/tutor/${kind}`, { method: "POST", body: JSON.stringify(body) }));
    expect((await send({})).status).toBe(400);
    expect(called).toBe(0);
    const response = await send({ studyId: "study", title: "Tema", subject: "Matéria", chunks: [{ studyId: "study" }], model: "chosen-model" });
    expect(response.status).toBe(200);
    expect(called).toBe(1);
    invalidResponse = true;
    expect((await send({ studyId: "study", title: "Tema", subject: "Matéria", chunks: [{ studyId: "study" }] })).status).toBe(502);
  });
}
