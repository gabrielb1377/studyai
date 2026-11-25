import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { quotaExceededMessage, quotaRateLimitHeaders } from "../src/server/ai/quota-policy";

function loadModule(file: string, dependencies: Record<string, unknown>, nodeEnv = "test") {
  const source = readFileSync(path.join(process.cwd(), file), "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiled = { exports: {} };
  vm.runInNewContext(js, {
    module: compiled,
    exports: compiled.exports,
    require: (id: string) => dependencies[id],
    Request,
    Response,
    TextEncoder,
    console,
    process: { env: { NODE_ENV: nodeEnv } },
  });
  return compiled.exports;
}

class FakeNextResponse {
  static json(data: unknown, init?: { status?: number; headers?: Record<string, string> }) {
    return { status: init?.status ?? 200, body: data, headers: init?.headers ?? {} };
  }
}

test("contador local aplica os limites reais e os cabeçalhos acompanham o consumo", async () => {
  const { QuotaService } = loadModule("src/server/ai/QuotaService.ts", {
    "@/server/database/Postgres": { hasPostgres: () => false, query: async () => ({ rows: [] }) },
  }) as { QuotaService: { checkAndConsume: (userId: string, options: { provider: string; useSharedKeys: boolean }) => Promise<{
    allowed: boolean;
    blockedBy?: "daily" | "minute";
    retryAfter?: number;
    quota: Parameters<typeof quotaRateLimitHeaders>[0];
  }> } };
  const userId = `sprint42-${crypto.randomUUID()}`;
  const first = await QuotaService.checkAndConsume(userId, { provider: "shared", useSharedKeys: true });
  expect(first.allowed).toBe(true);
  expect(first.quota.daily).toMatchObject({ used: 1, remaining: 499, limit: 500 });
  expect(first.quota.minute).toMatchObject({ used: 1, remaining: 19, limit: 20 });
  expect(quotaRateLimitHeaders(first.quota)).toMatchObject({
    "X-RateLimit-Remaining": "499",
    "X-StudyAI-Minute-Remaining": "19",
  });

  let latest = first;
  for (let index = 1; index <= 20; index += 1) {
    latest = await QuotaService.checkAndConsume(userId, { provider: "shared", useSharedKeys: true });
  }
  expect(latest.allowed).toBe(false);
  expect(latest.blockedBy).toBe("minute");
  expect(latest.retryAfter).toBeGreaterThan(0);
  expect(quotaExceededMessage(latest)).toContain("por minuto");

  const production = loadModule("src/server/ai/QuotaService.ts", {
    "@/server/database/Postgres": { hasPostgres: () => false, query: async () => ({ rows: [] }) },
  }, "production") as { QuotaService: typeof QuotaService };
  const productionError = await production.QuotaService
    .checkAndConsume("production-user", { provider: "shared", useSharedKeys: true })
    .then(() => null, (error: unknown) => error);
  expect(productionError).toMatchObject({ code: "QUOTA_STORAGE_UNAVAILABLE" });
});

test("LLM Judge exige sessão e CSRF e ignora chave enviada pelo navegador", async () => {
  const checks: string[] = [];
  let generated: Record<string, unknown> | undefined;
  const route = loadModule("src/app/api/ai-quality/judge/route.ts", {
    "next/server": { NextResponse: FakeNextResponse },
    "@/features/ai/AIService": {
      AIService: {
        generate: async (request: Record<string, unknown>) => {
          generated = request;
          return { text: "{}", provider: "gemini", model: "gemini-test" };
        },
      },
    },
    "@/server/auth/http": {
      requireCsrf: () => checks.push("csrf"),
      requireUser: () => { checks.push("user"); return { sub: "user-A" }; },
      requireActiveSession: async () => ({ sub: "user-A" }),
      jsonBody: async (request: Request) => request.json(),
      apiError: () => FakeNextResponse.json({ error: "safe" }, { status: 500 }),
    },
    "@/server/ai/QuotaMiddleware": {
      withAIQuota: async (
        request: Request,
        handler: (request: Request, aiRequest: Record<string, unknown>) => Promise<unknown>,
      ) => handler(request, {
        history: [],
        message: "prompt autorizado",
        provider: "gemini",
        model: "gemini-test",
        apiKeys: { gemini: "stored-key" },
      }),
    },
  }) as { POST: (request: Request) => Promise<{ status: number; body: unknown }> };

  const response = await route.POST(new Request("http://local/api/ai-quality/judge", {
    method: "POST",
    body: JSON.stringify({
      prompt: "Avalie esta resposta",
      provider: "gemini",
      model: "gemini-test",
      maxTokens: 500,
      apiKey: "attacker-controlled-key",
    }),
  }));

  expect(response.status).toBe(200);
  expect(checks).toEqual(["csrf", "user"]);
  expect(generated).toMatchObject({ apiKeys: { gemini: "stored-key" }, maxOutputTokens: 500 });
  expect(generated).not.toHaveProperty("apiKey");
});

test("Academy Studio não possui mais caminho visitante fora da quota", () => {
  const source = readFileSync(path.join(process.cwd(), "src/app/api/academy/studio/assist/route.ts"), "utf8");
  expect(source).toContain("requireCsrf(request)");
  expect(source).toContain("requireUser(request)");
  expect(source).toContain("withAIQuota(");
  expect(source).not.toContain("modo visitante");
  expect(source).not.toContain("ApiKeyService.getDecrypted");
});

test("middleware de IA protege mutações e não publica números fixos de quota", () => {
  const source = readFileSync(path.join(process.cwd(), "src/server/ai/QuotaMiddleware.ts"), "utf8");
  expect(source).toContain("requireCsrf(request)");
  expect(source).toContain("quotaRateLimitHeaders(status.quota)");
  expect(source).not.toContain('"X-RateLimit-Remaining", "499"');
  expect(source).not.toContain("remaining: 499");
});

