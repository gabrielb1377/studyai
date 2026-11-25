import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const testRequire = createRequire(__filename);

type Provider = {
  generate: (request: Record<string, unknown>) => Promise<Record<string, unknown>>;
  stream?: (request: Record<string, unknown>) => AsyncGenerator<Record<string, unknown>>;
};

function compileErrors() {
  const source = readFileSync(path.join(process.cwd(), "src/features/ai/AIErrors.ts"), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const compiled = { exports: {} };
  vm.runInContext(js, vm.createContext({ module: compiled, exports: compiled.exports, require: testRequire }));
  return compiled.exports as {
    AIError: new (message: string, code: string, status: number, provider?: string) => Error & { code: string; status: number };
    AIFallbackConsentError: new (offer: object) => Error & { fallback: { alternatives: Array<{ provider: string; model: string }> } };
    normalizeAIError: (error: unknown, fallback: string) => { body: { fallback?: object } };
    safeAIErrorLogMessage: (error: unknown) => string;
  };
}

function loadManager(options: {
  providers: Record<string, Provider>;
  statuses?: Record<string, { available: boolean; models: Array<{ name: string }> }>;
}) {
  const errors = compileErrors();
  const inspections: string[] = [];
  const deps: Record<string, unknown> = {
    "server-only": {},
    "./AIErrors": errors,
    "./AIProvider": { aiProviderIds: ["gemini", "ollama", "openrouter", "groq"] },
    "./HealthService": { HealthService: {
      check: async (provider: string) => {
        inspections.push(provider);
        const status = options.statuses?.[provider] ?? { available: false, models: [] };
        return { provider, latencyMs: 1, ...status };
      },
      checkAll: async () => [],
    } },
    "./ProviderRegistry": { ProviderRegistry: { get: (provider: string) => options.providers[provider] } },
    "./LatencyService": { LatencyService: { measure: async (operation: () => Promise<unknown>) => {
      try { return { value: await operation(), latencyMs: 1 }; }
      catch (error) { return { error, latencyMs: 1 }; }
    } } },
    "./AIResponseCache": { AIResponseCache: { keyFor: () => "cache-key", get: () => undefined, set: () => undefined } },
    "./TokenCounter": { TokenCounter: { messages: () => 0, estimate: () => 1 } },
  };
  const source = readFileSync(path.join(process.cwd(), "src/features/ai/ProviderManager.ts"), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const compiled = { exports: {} };
  vm.runInContext(js, vm.createContext({
    module: compiled,
    exports: compiled.exports,
    require: (id: string) => id in deps ? deps[id] : testRequire(id),
    crypto: { randomUUID: () => "log-id" },
    Date,
    Map,
    performance,
  }));
  return {
    manager: (compiled.exports as { ProviderManager: {
      generate: (request: Record<string, unknown>) => Promise<Record<string, unknown>>;
      stream: (request: Record<string, unknown>) => AsyncGenerator<Record<string, unknown>>;
    } }).ProviderManager,
    errors,
    inspections,
  };
}

const response = (provider: string, model = `${provider}-model`) => ({ provider, model, text: `resposta ${provider}` });

async function capturedFailure(operation: Promise<unknown>) {
  try {
    await operation;
    return null;
  } catch (error) {
    return error;
  }
}

test("sucesso primário não consulta nem chama alternativa", async () => {
  const attempts: string[] = [];
  const { manager, inspections } = loadManager({
    providers: { gemini: { generate: async () => { attempts.push("gemini"); return response("gemini"); } } },
  });
  const result = await manager.generate({ provider: "gemini", history: [], message: "Olá", requestId: "request-0001", fallbackPolicy: "consent" });
  expect(result).toMatchObject({ provider: "gemini", execution: { fallbackUsed: false } });
  expect(attempts).toEqual(["gemini"]);
  expect(inspections).toEqual([]);
});

for (const scenario of [
  { name: "rate limit", code: "RATE_LIMIT", status: 429 },
  { name: "timeout", code: "TIMEOUT", status: 504 },
  { name: "rede", code: "PROVIDER_ERROR", status: 502 },
  { name: "indisponibilidade", code: "PROVIDER_UNAVAILABLE", status: 503 },
]) {
  test(`falha recuperável (${scenario.name}) oferece alternativa sem executá-la`, async () => {
    const attempts: string[] = [];
    const { manager, errors } = loadManager({
      providers: {
        gemini: { generate: async () => { attempts.push("gemini"); throw new errors.AIError("falha", scenario.code, scenario.status, "gemini"); } },
        groq: { generate: async () => { attempts.push("groq"); return response("groq"); } },
      },
      statuses: { groq: { available: true, models: [{ name: "groq-model" }] } },
    });
    let failure: unknown;
    try { await manager.generate({ provider: "gemini", history: [], message: "Olá", requestId: "request-0002", fallbackPolicy: "consent" }); }
    catch (error) { failure = error; }
    expect(failure).toMatchObject({ code: "FALLBACK_CONSENT_REQUIRED", fallback: { requestId: "request-0002" } });
    expect(attempts).toEqual(["gemini"]);
  });
}

test("autenticação rejeitada não oferece fallback", async () => {
  const { manager, inspections, errors } = loadManager({
    providers: { gemini: { generate: async () => { throw new errors.AIError("sem autorização", "PROVIDER_ERROR", 401, "gemini"); } } },
    statuses: { groq: { available: true, models: [{ name: "groq-model" }] } },
  });
  expect(await capturedFailure(manager.generate({ provider: "gemini", history: [], message: "Olá", requestId: "request-0003", fallbackPolicy: "consent" }))).toMatchObject({ status: 401 });
  expect(inspections).toEqual([]);
});

test("sem alternativa configurada preserva a falha primária", async () => {
  const { manager, errors } = loadManager({
    providers: { gemini: { generate: async () => { throw new errors.AIError("indisponível", "PROVIDER_ERROR", 503, "gemini"); } } },
  });
  expect(await capturedFailure(manager.generate({ provider: "gemini", history: [], message: "Olá", requestId: "request-0004", fallbackPolicy: "consent" }))).toMatchObject({ code: "PROVIDER_ERROR" });
});

test("consentimento executa somente a alternativa escolhida e informa modelo efetivo", async () => {
  const attempts: string[] = [];
  const { manager } = loadManager({
    providers: {
      groq: { generate: async () => { attempts.push("groq"); return response("groq", "groq-model"); } },
      openrouter: { generate: async () => { attempts.push("openrouter"); return response("openrouter"); } },
    },
    statuses: {
      groq: { available: true, models: [{ name: "groq-model" }] },
      openrouter: { available: true, models: [{ name: "openrouter-model" }] },
    },
  });
  const result = await manager.generate({
    provider: "gemini", history: [], message: "Olá", requestId: "request-0005", requestOwner: "account-a", fallbackPolicy: "consent",
    fallbackConsent: { requestId: "request-0005", originalProvider: "gemini", provider: "groq", model: "groq-model" },
  });
  expect(result).toMatchObject({ provider: "groq", model: "groq-model", execution: { fallbackUsed: true, attemptedProviders: ["gemini", "groq"] } });
  expect(attempts).toEqual(["groq"]);
});

test("duplicata é idempotente por conta e não mistura contas", async () => {
  let calls = 0;
  const { manager } = loadManager({
    providers: { groq: { generate: async () => { calls++; return response("groq", "groq-model"); } } },
    statuses: { groq: { available: true, models: [{ name: "groq-model" }] } },
  });
  const base = {
    provider: "gemini", history: [], message: "Olá", requestId: "request-0006", fallbackPolicy: "consent",
    fallbackConsent: { requestId: "request-0006", originalProvider: "gemini", provider: "groq", model: "groq-model" },
  };
  await Promise.all([
    manager.generate({ ...base, requestOwner: "account-a" }),
    manager.generate({ ...base, requestOwner: "account-a" }),
  ]);
  await manager.generate({ ...base, requestOwner: "account-b" });
  expect(calls).toBe(2);
});

test("falha da alternativa não tenta um terceiro provedor", async () => {
  const attempts: string[] = [];
  const { manager, errors } = loadManager({
    providers: {
      groq: { generate: async () => { attempts.push("groq"); throw new errors.AIError("falha", "PROVIDER_ERROR", 503, "groq"); } },
      openrouter: { generate: async () => { attempts.push("openrouter"); return response("openrouter"); } },
    },
    statuses: { groq: { available: true, models: [{ name: "groq-model" }] } },
  });
  expect(await capturedFailure(manager.generate({
    provider: "gemini", history: [], message: "Olá", requestId: "request-0007", requestOwner: "account-a", fallbackPolicy: "consent",
    fallbackConsent: { requestId: "request-0007", originalProvider: "gemini", provider: "groq", model: "groq-model" },
  }))).toMatchObject({ provider: "groq" });
  expect(attempts).toEqual(["groq"]);
});

test("resposta parcial é preservada e não oferece fallback", async () => {
  const attempts: string[] = [];
  const { manager, errors } = loadManager({
    providers: { gemini: { generate: async () => response("gemini"), async *stream() {
      attempts.push("gemini");
      yield { type: "delta", text: "parcial" };
      throw new errors.AIError("interrompido", "PROVIDER_ERROR", 503, "gemini");
    } } },
    statuses: { groq: { available: true, models: [{ name: "groq-model" }] } },
  });
  const iterator = manager.stream({ provider: "gemini", history: [], message: "Olá", requestId: "request-0008", fallbackPolicy: "consent" });
  expect(await iterator.next()).toMatchObject({ value: { type: "delta", text: "parcial" } });
  expect(await capturedFailure(iterator.next())).toMatchObject({ code: "PARTIAL_RESPONSE" });
  expect(attempts).toEqual(["gemini"]);
});

test("erro público carrega somente a oferta segura de consentimento", () => {
  const errors = compileErrors();
  const offer = { requestId: "request-0009", primaryProvider: "gemini", alternatives: [{ provider: "groq", model: "m", cost: "byok", notice: "aviso" }] };
  const normalized = errors.normalizeAIError(new errors.AIFallbackConsentError(offer), "erro");
  expect(normalized.body.fallback).toEqual(offer);
  expect(JSON.stringify(normalized)).not.toContain("apiKey");
});
