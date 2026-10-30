import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const testRequire = createRequire(__filename);

test("OpenRouter lista modelos da conta e recusa modelo ausente", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fakeFetch = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url.endsWith("/models/user")) return Response.json({ data: [{ id: "org/model-a", context_length: 8192 }] });
    return Response.json({ model: "org/model-a", choices: [{ message: { content: "Resposta" } }] });
  };
  class TestAIError extends Error { constructor(message: string) { super(message); } }
  const deps: Record<string, unknown> = { "server-only": {}, "../AIErrors": { AIError: TestAIError }, "../TokenCounter": { TokenCounter: { truncate: (v: string) => v, estimate: () => 1 } } };
  const source = readFileSync(path.join(process.cwd(), "src/features/ai/providers/OpenAICompatibleProvider.ts"), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const compiled = { exports: {} };
  vm.runInContext(js, vm.createContext({ module: compiled, exports: compiled.exports, require: (id: string) => id in deps ? deps[id] : testRequire(id), fetch: fakeFetch, Response, AbortSignal }));
  const make = (compiled.exports as { createOpenAICompatibleProvider: (options: object) => { inspect: (signal?: AbortSignal, key?: string) => Promise<{ available: boolean; models: Array<{ name: string }> }>; generate: (request: object) => Promise<{ model: string }> } }).createOpenAICompatibleProvider;
  const provider = make({ id: "openrouter", name: "OpenRouter", baseUrl: "https://example.invalid/api/v1", apiKey: () => undefined });
  const status = await provider.inspect(undefined, "fake-key");
  expect(status.available).toBe(true);
  expect(status.models.map((model) => model.name)).toEqual(["org/model-a"]);
  expect(calls[0].url).toContain("/models/user");
  let unavailable = false;
  try { await provider.generate({ history: [], message: "Olá", model: "not-available", apiKey: "fake-key" }); }
  catch (error) { unavailable = error instanceof Error && /não está disponível/.test(error.message); }
  expect(unavailable).toBe(true);
  expect(calls.filter((call) => call.url.endsWith("/chat/completions"))).toHaveLength(0);
  const result = await provider.generate({ history: [], message: "Olá", model: "org/model-a", apiKey: "fake-key" });
  expect(result.model).toBe("org/model-a");
  const sent = calls.find((call) => call.url.endsWith("/chat/completions"));
  expect(JSON.parse(String(sent?.init?.body)).model).toBe("org/model-a");
});

test("Gemini lista todas as páginas e somente modelos de geração", async () => {
  const fakeFetch = async (value: string | URL) => {
    const page = new URL(value).searchParams.get("pageToken");
    return Response.json(page
      ? { models: [{ name: "models/gemini-b", supportedGenerationMethods: ["generateContent"] }] }
      : { models: [{ name: "models/gemini-a", supportedGenerationMethods: ["generateContent"] }, { name: "models/embed", supportedGenerationMethods: ["embedContent"] }], nextPageToken: "next" });
  };
  const source = readFileSync(path.join(process.cwd(), "src/features/ai/providers/GeminiProvider.ts"), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const compiled = { exports: {} };
  const deps: Record<string, unknown> = { "server-only": {}, "../AIErrors": { AIError: class extends Error {} } };
  vm.runInContext(js, vm.createContext({ module: compiled, exports: compiled.exports, require: (id: string) => id in deps ? deps[id] : testRequire(id), fetch: fakeFetch, Response, URL, AbortController, AbortSignal, setTimeout, clearTimeout, performance, process: { env: {} } }));
  const provider = (compiled.exports as { GeminiProvider: { inspect: (signal?: AbortSignal, key?: string) => Promise<{ available: boolean; models: Array<{ name: string }> }> } }).GeminiProvider;
  const status = await provider.inspect(undefined, "fake-key");
  expect(status.available).toBe(true);
  expect(status.models.map((model) => model.name)).toEqual(["gemini-a", "gemini-b"]);
});

test("estado com chave pessoal não é compartilhado entre contas", async () => {
  let inspections = 0;
  const provider = { id: "gemini", inspect: async (_: unknown, key?: string) => { inspections++; return { provider: "gemini", available: true, models: [{ name: key ?? "shared" }], latencyMs: 0 }; } };
  const deps: Record<string, unknown> = { "server-only": {}, "./ProviderRegistry": { ProviderRegistry: { get: () => provider } }, "./LatencyService": { LatencyService: { measure: async (operation: () => Promise<unknown>) => ({ value: await operation(), latencyMs: 1 }) } } };
  const source = readFileSync(path.join(process.cwd(), "src/features/ai/HealthService.ts"), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const compiled = { exports: {} };
  vm.runInContext(js, vm.createContext({ module: compiled, exports: compiled.exports, require: (id: string) => id in deps ? deps[id] : testRequire(id), Date, Map }));
  const service = (compiled.exports as { HealthService: { check: (provider: string, options: object) => Promise<{ models: Array<{ name: string }> }> } }).HealthService;
  const a = await service.check("gemini", { apiKey: "key-a" });
  const b = await service.check("gemini", { apiKey: "key-b" });
  expect(a.models[0].name).toBe("key-a");
  expect(b.models[0].name).toBe("key-b");
  expect(inspections).toBe(2);
});

test("modelo escolhido não troca silenciosamente de provedor", async () => {
  const attempts: string[] = [];
  class TestAIError extends Error {}
  const registry = { get: (id: string) => ({ generate: async () => { attempts.push(id); throw new TestAIError("modelo indisponível"); } }) };
  const deps: Record<string, unknown> = {
    "server-only": {}, "./AIErrors": { AIError: TestAIError, safeAIErrorLogMessage: () => "indisponível" },
    "./HealthService": { HealthService: { checkAll: async () => [] } }, "./ProviderRegistry": { ProviderRegistry: registry },
    "./LatencyService": { LatencyService: { measure: async (operation: () => Promise<unknown>) => { try { return { value: await operation(), latencyMs: 1 }; } catch (error) { return { error, latencyMs: 1 }; } } } },
    "./AIResponseCache": { AIResponseCache: { keyFor: () => "key", get: () => undefined, set: () => undefined } },
    "./TokenCounter": { TokenCounter: { messages: () => 0, estimate: () => 0 } },
  };
  const source = readFileSync(path.join(process.cwd(), "src/features/ai/ProviderManager.ts"), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const compiled = { exports: {} };
  vm.runInContext(js, vm.createContext({ module: compiled, exports: compiled.exports, require: (id: string) => id in deps ? deps[id] : testRequire(id), crypto: { randomUUID: () => "test-id" }, Date, performance }));
  const manager = (compiled.exports as { ProviderManager: { generate: (request: object) => Promise<unknown> } }).ProviderManager;
  try { await manager.generate({ provider: "gemini", mode: "automatic", model: "modelo-a", history: [], message: "Olá" }); } catch { /* provider intentionally failed */ }
  expect(attempts).toEqual(["gemini"]);
});
