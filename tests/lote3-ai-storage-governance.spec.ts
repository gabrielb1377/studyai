import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const testRequire = createRequire(__filename);

function loadModule(
  file: string,
  dependencies: Record<string, unknown> = {},
  globals: Record<string, unknown> = {},
) {
  const source = readFileSync(path.join(process.cwd(), file), "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const compiled = { exports: {} as Record<string, unknown> };
  const resolvedDeps: Record<string, unknown> = {
    "server-only": {},
    ...dependencies,
  };
  vm.runInContext(
    js,
    vm.createContext({
      module: compiled,
      exports: compiled.exports,
      require: (id: string) => (id in resolvedDeps ? resolvedDeps[id] : testRequire(id)),
      Buffer,
      Date,
      URL,
      Response,
      Request,
      Headers,
      TextEncoder,
      TextDecoder,
      ReadableStream,
      AbortController,
      AbortSignal,
      setTimeout,
      clearTimeout,
      performance,
      crypto: globalThis.crypto,
      process: { env: { NODE_ENV: "test" } },
      console,
      ...globals,
    }),
  );
  return compiled.exports;
}

function isDisposableLocalPostgres(url: string | undefined): url is string {
  if (!url || process.env.STUDYAI_ALLOW_LOCAL_DB_TESTS !== "1") return false;
  try {
    const parsed = new URL(url);
    return ["127.0.0.1", "localhost", "::1", "[::1]"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

class FakeNextResponse extends Response {
  static json(data: unknown, init?: ResponseInit) {
    const headers = new Headers(init?.headers);
    headers.set("content-type", "application/json");
    return new Response(JSON.stringify(data), { ...init, headers });
  }
}

function createLote3PgRuntime(
  databaseUrl: string,
  envOverrides: Record<string, string | undefined> = {},
  objectStorageMock?: Record<string, unknown>,
) {
  const env: Record<string, string | undefined> = {
    NODE_ENV: "test",
    DATABASE_URL: databaseUrl,
    DATABASE_SSL: "false",
    AUTH_SECRET: "lote3-test-auth-secret-with-at-least-32-chars!!",
    ...envOverrides,
  };
  const sharedGlobals = {
    process: { env },
    console: { ...console, warn: () => undefined, info: () => undefined, error: () => undefined },
  };
  const pgMod = loadModule("src/server/database/Postgres.ts", {}, sharedGlobals);
  const aiProviderMod = loadModule("src/features/ai/AIProvider.ts", {}, sharedGlobals);
  const aiErrorsMod = loadModule("src/features/ai/AIErrors.ts", { "./AIProvider": aiProviderMod }, sharedGlobals);
  const quotaPolicyMod = loadModule("src/server/ai/quota-policy.ts", {}, sharedGlobals);
  const quotaServiceMod = loadModule("src/server/ai/QuotaService.ts", {
    "@/server/database/Postgres": pgMod,
  }, sharedGlobals);
  const rateLimitServiceMod = loadModule("src/server/security/RateLimitService.ts", {
    "@/server/database/Postgres": pgMod,
  }, sharedGlobals);
  const cleanupMod = loadModule("src/server/database/OperationalCleanup.ts", {
    "@/server/database/Postgres": pgMod,
    "@/server/security/RateLimitService": rateLimitServiceMod,
    "@/server/ai/QuotaService": quotaServiceMod,
  }, sharedGlobals);
  const cloudDbMod = loadModule("src/server/cloud/CloudDatabase.ts", {
    "@/server/database/Postgres": pgMod,
    "@/server/storage/ObjectStorage": {
      ObjectStorage: objectStorageMock ?? {
        mode: () => "database",
        key: (u: string, id: string, h: string) => `users/${u}/materials/${id}/${h}`,
        put: async () => undefined,
        get: async () => Buffer.alloc(0),
        delete: async () => undefined,
      },
    },
  }, sharedGlobals);

  return {
    env,
    postgresPool: pgMod.postgresPool as () => { end: () => Promise<void> },
    QuotaService: quotaServiceMod.QuotaService as Record<string, (...args: unknown[]) => Promise<unknown>>,
    estimateReservationTokens: quotaServiceMod.estimateReservationTokens as (input: Record<string, unknown>) => {
      inputEstimate: number;
      outputEstimate: number;
      reserveTokens: number;
    },
    OperationalCleanup: cleanupMod.OperationalCleanup as {
      run: (opts?: Record<string, unknown>) => Promise<{ executed: boolean; rateLimitsRemoved: number; quotaMinuteBucketsRemoved: number }>;
    },
    CloudDatabase: cloudDbMod.CloudDatabase as Record<string, (...args: unknown[]) => Promise<unknown>>,
    aiProviderMod,
    aiErrorsMod,
    quotaPolicyMod,
    quotaServiceMod,
    sharedGlobals,
  };
}

test.describe("Lote 3A/3B — Contratos de provedores, BYOK, e-mail e PS-2", () => {
  test("PS-2: withQuotaEnforcement removido; withAIQuota preserva CSRF antes de auth/handler", () => {
    const source = readFileSync(path.join(process.cwd(), "src/server/ai/QuotaMiddleware.ts"), "utf8");
    expect(source).not.toContain("withQuotaEnforcement");
    expect(source).toContain("export async function withAIQuota");
    expect(source.indexOf("requireCsrf(request)")).toBeLessThan(source.indexOf("requireUser(request)"));
    expect(source.indexOf("requireUser(request)")).toBeLessThan(source.indexOf("requireActiveSession(request, user)"));
  });

  test("Provedores Gemini, Groq e OpenRouter contabilizam métricas oficiais (generate + stream), nunca inventam contagem ausente e respeitam strictByok", async () => {
    const aiProviderMod = loadModule("src/features/ai/AIProvider.ts");
    const aiErrorsMod = loadModule("src/features/ai/AIErrors.ts", { "./AIProvider": aiProviderMod });
    const tokenCounterMod = loadModule("src/features/ai/TokenCounter.ts");

    // 1) Gemini com usageMetadata oficial (generate) + sem usageMetadata (stream) + strictByok bloqueando fallback para env
    const geminiResponses: Array<() => Response> = [
      () => new Response(JSON.stringify({ models: [{ name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"], outputTokenLimit: 8192 }] }), { status: 200 }),
      () => new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: "Explicação oficial Gemini." }] } }],
        usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 45, totalTokenCount: 165 },
      }), { status: 200 }),
      () => new Response(JSON.stringify({ models: [{ name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"], outputTokenLimit: 8192 }] }), { status: 200 }),
      () => {
        const sse = [
          'data: {"candidates":[{"content":{"parts":[{"text":"Parte 1 "}]}}]}\n\n',
          'data: {"candidates":[{"content":{"parts":[{"text":"Parte 2"}]}}]}\n\n',
        ].join("");
        return new Response(sse, { status: 200, headers: { "content-type": "text/event-stream" } });
      },
    ];
    const geminiMod = loadModule("src/features/ai/providers/GeminiProvider.ts", {
      "../AIErrors": aiErrorsMod,
      "../AIProvider": aiProviderMod,
    }, {
      fetch: async () => geminiResponses.shift()!(),
      process: { env: { GEMINI_API_KEY: "shared-server-gemini-key" } },
    }) as {
      GeminiProvider: {
        generate: (req: Record<string, unknown>) => Promise<{ text: string; usage?: Record<string, unknown> }>;
        stream: (req: Record<string, unknown>) => AsyncGenerator<{ type: string; response?: { text: string; usage?: Record<string, unknown> } }>;
      };
    };

    const gemGen = await geminiMod.GeminiProvider.generate({ history: [], message: "Explique DNA" });
    expect(gemGen.usage).toEqual({ inputTokens: 120, outputTokens: 45, totalTokens: 165, source: "provider" });

    // Stream sem usageMetadata deve retornar usage undefined (nunca caracteres contados como tokens reais)
    let streamDone: { text: string; usage?: Record<string, unknown> } | undefined;
    for await (const ev of geminiMod.GeminiProvider.stream({ history: [], message: "Stream sem métricas" })) {
      if (ev.type === "done") streamDone = ev.response;
    }
    expect(streamDone?.text).toBe("Parte 1 Parte 2");
    expect(streamDone?.usage).toBeUndefined();

    // strictByok: true sem apiKeyOverride NUNCA recorre a process.env.GEMINI_API_KEY
    let strictErr: unknown;
    try {
      await geminiMod.GeminiProvider.generate({ history: [], message: "Teste BYOK", strictByok: true, apiKey: "" });
    } catch (e) {
      strictErr = e;
    }
    expect(String(strictErr)).toContain("BYOK");

    // 2) OpenAI-compatible (Groq / OpenRouter) com usage oficial no stream + strictByok
    const groqResponses: Array<() => Response> = [
      () => new Response(JSON.stringify({ data: [{ id: "llama-3.3-70b", context_length: 16384, active: true }] }), { status: 200 }),
      () => {
        const sse = [
          'data: {"model":"llama-3.3-70b","choices":[{"delta":{"content":"Olá "}}]}\n',
          'data: {"model":"llama-3.3-70b","choices":[{"delta":{"content":"Groq!"}}]}\n',
          'data: {"model":"llama-3.3-70b","choices":[],"usage":{"prompt_tokens":80,"completion_tokens":20,"total_tokens":100}}\n',
          "data: [DONE]\n",
        ].join("");
        return new Response(sse, { status: 200, headers: { "content-type": "text/event-stream" } });
      },
    ];
    const oaiMod = loadModule("src/features/ai/providers/OpenAICompatibleProvider.ts", {
      "../AIErrors": aiErrorsMod,
      "../AIProvider": aiProviderMod,
      "../TokenCounter": tokenCounterMod,
    }, {
      fetch: async () => groqResponses.shift()!(),
      process: { env: { GROQ_API_KEY: "shared-server-groq-key" } },
    }) as {
      createOpenAICompatibleProvider: (cfg: Record<string, unknown>) => {
        generate: (req: Record<string, unknown>) => Promise<unknown>;
        stream: (req: Record<string, unknown>) => AsyncGenerator<{ type: string; response?: { text: string; usage?: Record<string, unknown> } }>;
      };
    };

    const groq = oaiMod.createOpenAICompatibleProvider({
      id: "groq",
      name: "Groq",
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: () => "shared-server-groq-key",
    });
    let groqDone: { text: string; usage?: Record<string, unknown> } | undefined;
    for await (const ev of groq.stream({ history: [], message: "Teste Groq", model: "llama-3.3-70b" })) {
      if (ev.type === "done") groqDone = ev.response;
    }
    expect(groqDone?.usage).toEqual({ inputTokens: 80, outputTokens: 20, totalTokens: 100, source: "provider" });

    let groqStrictErr: unknown;
    try {
      await groq.generate({ history: [], message: "Teste BYOK Groq", strictByok: true, apiKey: "   " });
    } catch (e) {
      groqStrictErr = e;
    }
    expect(String(groqStrictErr)).toContain("BYOK");
  });

  test("Gate de e-mail verificado bloqueia IA compartilhada (403), impede spoofing do cliente e preserva BYOK", async () => {
    const aiProviderMod = loadModule("src/features/ai/AIProvider.ts");
    const aiErrorsMod = loadModule("src/features/ai/AIErrors.ts", { "./AIProvider": aiProviderMod });
    const quotaPolicyMod = loadModule("src/server/ai/quota-policy.ts");

    let isVerified = false;
    let userByok: Record<string, string | undefined> = {};
    let reservedCount = 0;
    let handlerCalled = 0;
    let capturedReq: Record<string, unknown> | undefined;

    const middleware = loadModule("src/server/ai/QuotaMiddleware.ts", {
      "next/server": { NextResponse: FakeNextResponse },
      "./QuotaService": {
        estimateReservationTokens: () => ({ inputEstimate: 100, outputEstimate: 500, reserveTokens: 600 }),
        QuotaService: {
          isEmailVerified: async () => isVerified,
          getQuotaInfo: async () => ({
            daily: { used: 0, limit: 500, remaining: 500, resetAt: new Date(Date.now() + 86_400_000).toISOString() },
            minute: { used: 0, limit: 20, remaining: 20, resetAt: new Date(Date.now() + 60_000).toISOString() },
            sharedKeysUsed: false,
          }),
          reserveSharedBudget: async () => {
            reservedCount += 1;
            return {
              allowed: true,
              remaining: 499,
              limit: 500,
              resetAt: new Date(Date.now() + 86_400_000).toISOString(),
              reservationId: `res-${reservedCount}`,
              reservedTokens: 600,
              quota: {
                daily: { used: reservedCount, limit: 500, remaining: 500 - reservedCount, resetAt: new Date(Date.now() + 86_400_000).toISOString() },
                minute: { used: reservedCount, limit: 20, remaining: 20 - reservedCount, resetAt: new Date(Date.now() + 60_000).toISOString() },
                sharedKeysUsed: true,
              },
            };
          },
          reconcileReservation: async () => ({ reconciled: true, chargedTokens: 150, releasedTokens: 450, usageSource: "provider", status: "reconciled" }),
        },
      },
      "@/server/auth/http": {
        requireCsrf: () => undefined,
        requireUser: () => ({ sub: "u-email-test", sessionId: "s-1" }),
        requireActiveSession: async () => ({ sub: "u-email-test", sessionId: "s-1" }),
        jsonBody: async (req: Request) => JSON.parse(await req.text()),
      },
      "@/features/ai/AIProvider": aiProviderMod,
      "./ApiKeyService": { ApiKeyService: { getDecrypted: async (_u: string, p: string) => userByok[p] } },
      "@/features/ai/AIErrors": aiErrorsMod,
      "@/features/tutor/utils/tutor-context-validation": { isTutorStudyContext: () => false },
      "@/features/retrieval/retrieval-validation": { isRetrievedChunk: () => true },
      "./AIRoutingService": { AIRoutingService: { resolve: async (req: unknown) => req } },
      "./quota-policy": quotaPolicyMod,
    }) as {
      withAIQuota: (
        req: Request,
        handler: (req: Request, aiReq: Record<string, unknown>) => Promise<Response>,
        prepared?: Record<string, unknown>,
      ) => Promise<Response>;
    };

    // 1) Usuário não verificado tentando IA compartilhada (mesmo tentando forjar emailVerified/apiKeys/credentialOrigin no payload) -> 403
    const spoofedReq = new Request("https://studyai.invalid/api/tutor", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: "Olá",
        provider: "gemini",
        emailVerified: true,
        credentialOrigin: "byok",
        apiKeys: { gemini: "forged-key-from-client" },
      }),
    });
    const blocked = await middleware.withAIQuota(spoofedReq, async () => {
      handlerCalled += 1;
      return FakeNextResponse.json({ ok: true });
    }, { history: [], message: "Olá" });
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
    expect(reservedCount).toBe(0);
    expect(handlerCalled).toBe(0);

    // 2) Mesmo usuário não verificado, mas com chave BYOK salva no servidor -> permitido sem consumir cota compartilhada e com strictByok=true
    userByok = { gemini: "real-server-decrypted-byok-key" };
    const byokReq = new Request("https://studyai.invalid/api/tutor", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Olá com BYOK", provider: "gemini" }),
    });
    const byokRes = await middleware.withAIQuota(byokReq, async (_req, aiReq) => {
      handlerCalled += 1;
      capturedReq = aiReq;
      return FakeNextResponse.json({ ok: true });
    }, { history: [], message: "Olá com BYOK" });
    expect(byokRes.status).toBe(200);
    expect(reservedCount).toBe(0);
    expect(handlerCalled).toBe(1);
    expect(capturedReq?.strictByok).toBe(true);
    expect(capturedReq?.credentialOrigin).toBe("byok");
    expect(capturedReq?.emailVerified).toBe(false);

    // 3) Usuário verificado sem BYOK -> consome cota compartilhada e libera chamada
    userByok = {};
    isVerified = true;
    const verifiedReq = new Request("https://studyai.invalid/api/tutor", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Olá verificado", provider: "gemini" }),
    });
    const verifiedRes = await middleware.withAIQuota(verifiedReq, async (_req, aiReq) => {
      handlerCalled += 1;
      capturedReq = aiReq;
      return FakeNextResponse.json({ ok: true });
    }, { history: [], message: "Olá verificado" });
    expect(verifiedRes.status).toBe(200);
    expect(reservedCount).toBe(1);
    expect(capturedReq?.credentialOrigin).toBe("shared");
    expect(capturedReq?.strictByok).toBe(false);
    expect(capturedReq?.emailVerified).toBe(true);
  });

  test("PUT /api/files/[id] ignora Content-Length forjado baixo e valida cota pelo tamanho real do payload", async () => {
    const fileSecurity = loadModule("src/server/storage/FileSecurity.ts", {});
    const storageQuota = loadModule("src/server/storage/StorageQuota.ts", {}) as {
      storageQuotaExceededResponse: (input: {
        kind: "files" | "backups";
        usedBytes: number;
        limitBytes: number;
        requestedBytes: number;
      }) => Response;
    };
    let observedBytes = 0;

    const routeMod = loadModule("src/app/api/files/[id]/route.ts", {
      "next/server": { NextResponse: FakeNextResponse },
      "@/server/cloud/CloudDatabase": {
        CloudDatabase: {
          saveFile: async (_userId: string, _id: string, _name: string, _mime: string, _hash: string, content: Buffer) => {
            observedBytes = content.byteLength;
            if (content.byteLength > 100) {
              throw storageQuota.storageQuotaExceededResponse({
                kind: "files",
                usedBytes: 0,
                limitBytes: 100,
                requestedBytes: content.byteLength,
              });
            }
            return { id: _id, hash: _hash, sizeBytes: content.byteLength };
          },
        },
      },
      "@/server/auth/http": {
        requireCsrf: () => undefined,
        requireUser: () => ({ sub: "user-forged", sessionId: "s-forged" }),
        requireActiveSession: async () => undefined,
        requireSessionOwner: () => undefined,
        apiError: (error: unknown) => {
          if (error instanceof Response) return error;
          return FakeNextResponse.json({ error: String(error) }, { status: 400 });
        },
      },
      "@/server/security/Crypto": {
        secureHash: (buf: Buffer) => `sha256-${buf.byteLength}`,
      },
      "@/server/security/RateLimit": {
        rateLimit: async () => ({ allowed: true, remaining: 29, resetAt: Date.now() + 60_000 }),
      },
      "@/server/storage/FileSecurity": fileSecurity,
    }) as {
      PUT: (request: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
    };

    // Payload real de 256 bytes (PDF válido com magic bytes %PDF-) com Content-Length forjado de "10"
    const realPayload = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(247, 0x41)]);
    const forgedReq = new Request("https://studyai.invalid/api/files/f-forged", {
      method: "PUT",
      headers: {
        "content-type": "application/pdf",
        "content-length": "10",
        "x-file-name": "nota.pdf",
      },
      body: realPayload,
    });

    const res = await routeMod.PUT(forgedReq, { params: Promise.resolve({ id: "f-forged" }) });
    expect(res.status).toBe(413);
    expect(observedBytes).toBe(256);
    const body = await res.json();
    expect(body.code).toBe("STORAGE_QUOTA_EXCEEDED");
    expect(body.kind).toBe("files");
    expect(body.requestedBytes).toBe(256);
  });
});

test.describe("Lote 3A/3B — PostgreSQL real (orçamento global, tokens, concorrência e cotas de armazenamento)", () => {
  const databaseUrl = process.env.DATABASE_URL;
  test.skip(
    !isDisposableLocalPostgres(databaseUrl),
    "Requer PostgreSQL local descartável (DATABASE_URL loopback + STUDYAI_ALLOW_LOCAL_DB_TESTS=1).",
  );

  test("PG3-1: migration 0003 e schema.sql são idempotentes e criam tabelas de orçamento/reservas", async () => {
    const pg = testRequire("pg") as typeof import("pg");
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 2, ssl: false });
    try {
      const schemaSql = readFileSync(path.join(process.cwd(), "src/server/database/schema.sql"), "utf8");
      const mig0003 = readFileSync(path.join(process.cwd(), "migrations/0003_lote3_ai_budgets_and_storage_quotas.sql"), "utf8");
      await pool.query(schemaSql);
      await pool.query(schemaSql);
      await pool.query(mig0003);
      await pool.query(mig0003);

      const tables = await pool.query<{ tablename: string }>(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('ai_global_daily_budgets','ai_token_reservations','storage_reservations') ORDER BY tablename",
      );
      expect(tables.rows.map((r) => r.tablename)).toEqual([
        "ai_global_daily_budgets",
        "ai_token_reservations",
        "storage_reservations",
      ]);

      const col = await pool.query<{ column_name: string }>(
        "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='usage_quotas' AND column_name='reserved_tokens'",
      );
      expect(col.rows).toHaveLength(1);
    } finally {
      await pool.end();
    }
  });

  test("PG3-2: reserva, reconciliação real/estimada/falha/cancelamento e idempotência sem cobrança duplicada", async () => {
    const rt = createLote3PgRuntime(databaseUrl!, {
      AI_USER_DAILY_TOKEN_LIMIT: "100000",
      AI_GLOBAL_DAILY_TOKEN_BUDGET: "500000",
    });
    const pg = testRequire("pg") as typeof import("pg");
    const adminPool = new pg.Pool({ connectionString: databaseUrl, max: 2, ssl: false });
    const userId = `lote3_reconcile_${Date.now()}`;
    const today = new Date().toISOString().split("T")[0];

    try {
      await adminPool.query("DELETE FROM ai_global_daily_budgets WHERE date = $1::date", [today]);
      await adminPool.query("INSERT INTO users (id, email, password_hash, email_verified_at) VALUES ($1, $2, 'h', NOW())", [userId, `${userId}@example.test`]);

      expect(await rt.QuotaService.isEmailVerified(userId)).toBe(true);

      // 1) Reserva + reconciliação com uso oficial do provedor + idempotência na segunda chamada
      const res1 = (await rt.QuotaService.reserveSharedBudget(userId, {
        provider: "gemini",
        model: "gemini-2.5-flash",
        requestId: "req-official-1",
        reserveTokens: 1000,
        useSharedKeys: true,
      })) as { allowed: boolean; reservationId: string; reservedTokens: number };
      expect(res1.allowed).toBe(true);
      expect(res1.reservedTokens).toBe(1000);

      // Repetir mesmo requestId é idempotente (não reserva em dobro)
      const dupRes = (await rt.QuotaService.reserveSharedBudget(userId, {
        provider: "gemini",
        model: "gemini-2.5-flash",
        requestId: "req-official-1",
        reserveTokens: 1000,
        useSharedKeys: true,
      })) as { allowed: boolean; reservationId: string; deduplicated?: boolean };
      expect(dupRes.reservationId).toBe(res1.reservationId);
      expect(dupRes.deduplicated).toBe(true);

      const rec1 = (await rt.QuotaService.reconcileReservation(res1.reservationId, {
        outcome: "completed",
        provider: "gemini",
        model: "gemini-2.5-flash",
        usage: { inputTokens: 120, outputTokens: 80, totalTokens: 200, source: "provider" },
        emittedOutput: true,
        providerContacted: true,
      })) as { reconciled: boolean; chargedTokens: number; usageSource: string };
      expect(rec1).toMatchObject({ reconciled: true, chargedTokens: 200, usageSource: "provider" });

      // Segunda reconciliação (retry/callback duplicado) NÃO cobra novamente
      const rec1Dup = (await rt.QuotaService.reconcileReservation(res1.reservationId, {
        outcome: "completed",
        provider: "gemini",
        usage: { totalTokens: 200, source: "provider" },
        providerContacted: true,
      })) as { reconciled: boolean; alreadySettled?: boolean; chargedTokens: number };
      expect(rec1Dup.reconciled).toBe(false);
      expect(rec1Dup.alreadySettled).toBe(true);

      // 2) Resposta concluída SEM métricas oficiais -> política conservadora ("estimated")
      const res2 = (await rt.QuotaService.reserveSharedBudget(userId, {
        provider: "groq",
        requestId: "req-no-metrics-2",
        reserveTokens: 800,
        useSharedKeys: true,
      })) as { allowed: boolean; reservationId: string };
      const rec2 = (await rt.QuotaService.reconcileReservation(res2.reservationId, {
        outcome: "completed",
        provider: "groq",
        emittedOutput: true,
        emittedText: "Resposta sem telemetria oficial de tokens do provedor.",
        providerContacted: true,
      }, { inputEstimate: 100 })) as { reconciled: boolean; chargedTokens: number; usageSource: string };
      expect(rec2.reconciled).toBe(true);
      expect(rec2.usageSource).toBe("estimated");
      expect(rec2.chargedTokens).toBeGreaterThan(100);

      // 3) Cancelamento/falha APÓS streaming parcial NÃO libera indevidamente orçamento consumido
      const res3 = (await rt.QuotaService.reserveSharedBudget(userId, {
        provider: "openrouter",
        requestId: "req-partial-cancel-3",
        reserveTokens: 600,
        useSharedKeys: true,
      })) as { allowed: boolean; reservationId: string };
      const rec3 = (await rt.QuotaService.reconcileReservation(res3.reservationId, {
        outcome: "cancelled",
        provider: "openrouter",
        emittedOutput: true,
        emittedText: "Trecho parcial já emitido antes de cancelar",
        providerContacted: true,
      }, { inputEstimate: 90 })) as { reconciled: boolean; chargedTokens: number; status: string };
      expect(rec3.status).toBe("cancelled");
      expect(rec3.chargedTokens).toBeGreaterThanOrEqual(150);

      // 4) Falha ANTES de contatar provedor (ex.: MISSING_API_KEY) libera 100% da reserva
      const res4 = (await rt.QuotaService.reserveSharedBudget(userId, {
        provider: "gemini",
        requestId: "req-fail-before-4",
        reserveTokens: 500,
        useSharedKeys: true,
      })) as { allowed: boolean; reservationId: string };
      const rec4 = (await rt.QuotaService.reconcileReservation(res4.reservationId, {
        outcome: "failed",
        provider: "gemini",
        emittedOutput: false,
        providerContacted: false,
      })) as { reconciled: boolean; chargedTokens: number; releasedTokens: number };
      expect(rec4.chargedTokens).toBe(0);
      expect(rec4.releasedTokens).toBe(500);

      const expectedTotal = rec1.chargedTokens + rec2.chargedTokens + rec3.chargedTokens;
      const quotaRow = await adminPool.query<{ tokens_count: string; reserved_tokens: string }>(
        "SELECT tokens_count::text, reserved_tokens::text FROM usage_quotas WHERE user_id=$1 AND date=$2::date AND minute_bucket=0",
        [userId, today],
      );
      expect(Number(quotaRow.rows[0].tokens_count)).toBe(expectedTotal);
      expect(Number(quotaRow.rows[0].reserved_tokens)).toBe(0);
    } finally {
      await adminPool.query("DELETE FROM users WHERE id = $1", [userId]).catch(() => undefined);
      await adminPool.query("DELETE FROM ai_global_daily_budgets WHERE date = $1::date", [today]).catch(() => undefined);
      await rt.postgresPool().end().catch(() => undefined);
      await adminPool.end().catch(() => undefined);
    }
  });

  test("PG3-3: concorrência multi-pool respeita orçamento global e limite individual, recupera reservas abandonadas e falha fechado", async () => {
    const globalEnv = {
      AI_GLOBAL_DAILY_TOKEN_BUDGET: "2000",
      AI_USER_DAILY_TOKEN_LIMIT: "5000",
    };
    const instA = createLote3PgRuntime(databaseUrl!, globalEnv);
    const instB = createLote3PgRuntime(databaseUrl!, globalEnv);
    const pg = testRequire("pg") as typeof import("pg");
    const adminPool = new pg.Pool({ connectionString: databaseUrl, max: 2, ssl: false });
    const userA = `lote3_conc_a_${Date.now()}`;
    const userB = `lote3_conc_b_${Date.now()}`;
    const today = new Date().toISOString().split("T")[0];

    try {
      await adminPool.query("DELETE FROM ai_global_daily_budgets WHERE date = $1::date", [today]);
      await adminPool.query(
        "INSERT INTO users (id, email, password_hash, email_verified_at) VALUES ($1, $2, 'h', NOW()), ($3, $4, 'h', NOW())",
        [userA, `${userA}@example.test`, userB, `${userB}@example.test`],
      );

      // 1) Orçamento global = 2000 tokens; 6 requisições simultâneas de 1000 tokens entre 2 pools -> exatamente 2 permitidas!
      const globalRace = await Promise.all([
        instA.QuotaService.reserveSharedBudget(userA, { provider: "gemini", requestId: "g-1", reserveTokens: 1000, useSharedKeys: true }),
        instB.QuotaService.reserveSharedBudget(userB, { provider: "groq", requestId: "g-2", reserveTokens: 1000, useSharedKeys: true }),
        instA.QuotaService.reserveSharedBudget(userB, { provider: "gemini", requestId: "g-3", reserveTokens: 1000, useSharedKeys: true }),
        instB.QuotaService.reserveSharedBudget(userA, { provider: "openrouter", requestId: "g-4", reserveTokens: 1000, useSharedKeys: true }),
        instA.QuotaService.reserveSharedBudget(userA, { provider: "gemini", requestId: "g-5", reserveTokens: 1000, useSharedKeys: true }),
        instB.QuotaService.reserveSharedBudget(userB, { provider: "groq", requestId: "g-6", reserveTokens: 1000, useSharedKeys: true }),
      ]) as Array<{ allowed: boolean; blockedBy?: string }>;

      const globalAllowed = globalRace.filter((r) => r.allowed);
      const globalBlocked = globalRace.filter((r) => !r.allowed);
      expect(globalAllowed).toHaveLength(2);
      expect(globalBlocked).toHaveLength(4);
      expect(globalBlocked.every((r) => r.blockedBy === "global_budget")).toBe(true);

      // 2) Simular reservas abandonadas (expiradas) -> OperationalCleanup reclama e libera orçamento global!
      await adminPool.query(
        "UPDATE ai_token_reservations SET expires_at = NOW() - INTERVAL '2 minutes' WHERE user_id IN ($1, $2) AND status = 'reserved'",
        [userA, userB],
      );
      await instA.OperationalCleanup.run({ batchLimit: 100 });
      const budgetAfterReclaim = await adminPool.query<{ reserved_tokens: string }>(
        "SELECT reserved_tokens::text FROM ai_global_daily_budgets WHERE date = $1::date",
        [today],
      );
      expect(Number(budgetAfterReclaim.rows[0].reserved_tokens)).toBe(0);

      // 3) Limite individual do usuário (1500 tokens) sob 4 chamadas concorrentes de 1000 tokens -> exatamente 1 permitida!
      instA.env.AI_GLOBAL_DAILY_TOKEN_BUDGET = "50000";
      instB.env.AI_GLOBAL_DAILY_TOKEN_BUDGET = "50000";
      instA.env.AI_USER_DAILY_TOKEN_LIMIT = "1500";
      instB.env.AI_USER_DAILY_TOKEN_LIMIT = "1500";
      const userRace = await Promise.all([
        instA.QuotaService.reserveSharedBudget(userA, { provider: "gemini", requestId: "u-1", reserveTokens: 1000, useSharedKeys: true }),
        instB.QuotaService.reserveSharedBudget(userA, { provider: "gemini", requestId: "u-2", reserveTokens: 1000, useSharedKeys: true }),
        instA.QuotaService.reserveSharedBudget(userA, { provider: "gemini", requestId: "u-3", reserveTokens: 1000, useSharedKeys: true }),
        instB.QuotaService.reserveSharedBudget(userA, { provider: "gemini", requestId: "u-4", reserveTokens: 1000, useSharedKeys: true }),
      ]) as Array<{ allowed: boolean; blockedBy?: string }>;
      expect(userRace.filter((r) => r.allowed)).toHaveLength(1);
      expect(userRace.filter((r) => r.blockedBy === "user_tokens")).toHaveLength(3);

      // 4) Fail-closed em produção com PostgreSQL indisponível
      const brokenRt = createLote3PgRuntime("postgresql://x:x@127.0.0.1:1/nope", { NODE_ENV: "production" });
      let failedClosed = false;
      try {
        await brokenRt.QuotaService.reserveSharedBudget(userA, { provider: "gemini", requestId: "fc-1", reserveTokens: 100, useSharedKeys: true });
      } catch {
        failedClosed = true;
      } finally {
        await brokenRt.postgresPool().end().catch(() => undefined);
      }
      expect(failedClosed).toBe(true);
    } finally {
      await adminPool.query("DELETE FROM users WHERE id IN ($1, $2)", [userA, userB]).catch(() => undefined);
      await adminPool.query("DELETE FROM ai_global_daily_budgets WHERE date = $1::date", [today]).catch(() => undefined);
      await instA.postgresPool().end().catch(() => undefined);
      await instB.postgresPool().end().catch(() => undefined);
      await adminPool.end().catch(() => undefined);
    }
  });

  test("PG3-4: cota acumulada de arquivos (concorrência 2 pools, substituição, exclusão, legado acima da cota e isolamento)", async () => {
    const quotaEnv = { STORAGE_FILES_QUOTA_BYTES: "1000" };
    const instA = createLote3PgRuntime(databaseUrl!, quotaEnv);
    const instB = createLote3PgRuntime(databaseUrl!, quotaEnv);
    const pg = testRequire("pg") as typeof import("pg");
    const adminPool = new pg.Pool({ connectionString: databaseUrl, max: 2, ssl: false });
    const userA = `lote3_files_a_${Date.now()}`;
    const userB = `lote3_files_b_${Date.now()}`;
    const userLegacy = `lote3_files_legacy_${Date.now()}`;

    try {
      await adminPool.query(
        "INSERT INTO users (id, email, password_hash) VALUES ($1, $2, 'h'), ($3, $4, 'h'), ($5, $6, 'h')",
        [userA, `${userA}@example.test`, userB, `${userB}@example.test`, userLegacy, `${userLegacy}@example.test`],
      );

      // 1) 4 uploads simultâneos de 400 bytes cada com cota 1000 -> exatamente 2 passam (800 bytes), 2 recebem 413
      const payload400 = Buffer.alloc(400, 65);
      const race = await Promise.allSettled([
        instA.CloudDatabase.saveFile(userA, "f1", "f1.txt", "text/plain", "h1", payload400),
        instB.CloudDatabase.saveFile(userA, "f2", "f2.txt", "text/plain", "h2", payload400),
        instA.CloudDatabase.saveFile(userA, "f3", "f3.txt", "text/plain", "h3", payload400),
        instB.CloudDatabase.saveFile(userA, "f4", "f4.txt", "text/plain", "h4", payload400),
      ]);
      const okFiles = race.filter((r) => r.status === "fulfilled");
      const rejectedFiles = race.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      expect(okFiles).toHaveLength(2);
      expect(rejectedFiles).toHaveLength(2);
      expect(rejectedFiles.every((r) => r.reason instanceof Response && r.reason.status === 413)).toBe(true);

      // 2) Substituição dentro do limite (400 -> 550 => total 950 <= 1000) passa; acima (550 -> 700 => 1100) falha 413
      const winnerId = (okFiles[0] as PromiseFulfilledResult<{ id: string }>).value.id;
      await instA.CloudDatabase.saveFile(userA, winnerId, "updated.txt", "text/plain", "h-up", Buffer.alloc(550, 66));
      let growErr: unknown;
      try {
        await instB.CloudDatabase.saveFile(userA, winnerId, "too-big.txt", "text/plain", "h-big", Buffer.alloc(700, 67));
      } catch (e) {
        growErr = e;
      }
      expect(growErr instanceof Response && growErr.status === 413).toBe(true);

      // 3) Exclusão libera cota corretamente
      await instA.CloudDatabase.deleteFile(userA, winnerId);
      await instB.CloudDatabase.saveFile(userA, "f-after-del", "after.txt", "text/plain", "h-del", Buffer.alloc(500, 68));

      // 4) Isolamento cross-user: usuário B tem cota independente
      await instB.CloudDatabase.saveFile(userB, "fb1", "fb1.txt", "text/plain", "hb1", Buffer.alloc(900, 69));

      // 5) Conta legada já acima da cota (1500 > 1000): não apaga arquivos existentes, bloqueia aumento e permite redução
      await adminPool.query(
        "INSERT INTO files (id, user_id, name, mime_type, hash, size_bytes, content, storage_provider) VALUES ('leg-1', $1, 'leg.txt', 'text/plain', 'hl1', 1500, $2, 'database')",
        [userLegacy, Buffer.alloc(1500, 70)],
      );
      let legacyGrowErr: unknown;
      try {
        await instA.CloudDatabase.saveFile(userLegacy, "leg-2", "new.txt", "text/plain", "hl2", Buffer.alloc(100, 71));
      } catch (e) {
        legacyGrowErr = e;
      }
      expect(legacyGrowErr instanceof Response && legacyGrowErr.status === 413).toBe(true);
      // Substituir arquivo legado por versão menor/igual é permitido sem apagar nada
      await instA.CloudDatabase.saveFile(userLegacy, "leg-1", "leg-smaller.txt", "text/plain", "hl3", Buffer.alloc(1200, 72));
      const legCount = await adminPool.query<{ c: string; s: string }>("SELECT COUNT(*)::text AS c, SUM(size_bytes)::text AS s FROM files WHERE user_id=$1", [userLegacy]);
      expect(Number(legCount.rows[0].c)).toBe(1);
      expect(Number(legCount.rows[0].s)).toBe(1200);
    } finally {
      await adminPool.query("DELETE FROM users WHERE id IN ($1, $2, $3)", [userA, userB, userLegacy]).catch(() => undefined);
      await instA.postgresPool().end().catch(() => undefined);
      await instB.postgresPool().end().catch(() => undefined);
      await adminPool.end().catch(() => undefined);
    }
  });

  test("PG3-5: cota acumulada de backups sob concorrência em 2 pools e isolamento", async () => {
    const pg = testRequire("pg") as typeof import("pg");
    const adminPool = new pg.Pool({ connectionString: databaseUrl, max: 2, ssl: false });
    const userA = `lote3_bak_a_${Date.now()}`;
    const userB = `lote3_bak_b_${Date.now()}`;

    // Cada registro serializado tem ~200 bytes; limite 350 bytes comporta exatamente 1 backup, não 2!
    const instA = createLote3PgRuntime(databaseUrl!, { STORAGE_BACKUPS_QUOTA_BYTES: "350" });
    const instB = createLote3PgRuntime(databaseUrl!, { STORAGE_BACKUPS_QUOTA_BYTES: "350" });

    try {
      await adminPool.query(
        "INSERT INTO users (id, email, password_hash) VALUES ($1, $2, 'h'), ($3, $4, 'h')",
        [userA, `${userA}@example.test`, userB, `${userB}@example.test`],
      );
      await adminPool.query(
        `INSERT INTO sync_records (user_id, entity, record_id, payload, version, hash, updated_at, device_id)
         VALUES ($1, 'notes', 'n1', '{"body":"conteudo do backup"}', 1, 'hb1', NOW(), 'd1'),
                ($2, 'notes', 'n1', '{"body":"conteudo do backup b"}', 1, 'hb2', NOW(), 'd2')`,
        [userA, userB],
      );

      const race = await Promise.allSettled([
        instA.CloudDatabase.createBackup(userA),
        instB.CloudDatabase.createBackup(userA),
        instA.CloudDatabase.createBackup(userA),
      ]);
      const okBaks = race.filter((r) => r.status === "fulfilled");
      const failBaks = race.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      expect(okBaks).toHaveLength(1);
      expect(failBaks).toHaveLength(2);
      expect(failBaks.every((r) => r.reason instanceof Response && r.reason.status === 413)).toBe(true);

      // Usuário B consegue criar backup independentemente
      const bakB = (await instB.CloudDatabase.createBackup(userB)) as { id: string };
      expect(bakB.id).toBeTruthy();
    } finally {
      await adminPool.query("DELETE FROM users WHERE id IN ($1, $2)", [userA, userB]).catch(() => undefined);
      await instA.postgresPool().end().catch(() => undefined);
      await instB.postgresPool().end().catch(() => undefined);
      await adminPool.end().catch(() => undefined);
    }
  });

  test("PG3-6: compensação em falha do S3, compensação S3 em falha do PostgreSQL e limpeza de reservas abandonadas", async () => {
    const pg = testRequire("pg") as typeof import("pg");
    const adminPool = new pg.Pool({ connectionString: databaseUrl, max: 2, ssl: false });
    const userId = `lote3_s3comp_${Date.now()}`;
    const triggerFn = `fail_files_insert_${Date.now()}`;

    let failS3Put = true;
    const s3Objects = new Set<string>();
    const s3Deletes: string[] = [];
    const s3Mock = {
      mode: () => "s3",
      key: (u: string, id: string, h: string) => `users/${u}/materials/${id}/${h}`,
      put: async (key: string) => {
        if (failS3Put) throw new Error("SIMULATED_S3_PUT_FAILURE");
        s3Objects.add(key);
      },
      get: async () => Buffer.alloc(0),
      delete: async (key: string) => {
        s3Deletes.push(key);
        s3Objects.delete(key);
      },
    };
    const rt = createLote3PgRuntime(databaseUrl!, { STORAGE_FILES_QUOTA_BYTES: "1000" }, s3Mock);

    try {
      await adminPool.query("INSERT INTO users (id, email, password_hash) VALUES ($1, $2, 'h')", [userId, `${userId}@example.test`]);

      // 1) Falha no S3 -> reserva liberada, nenhuma linha em `files`
      let s3Err: unknown;
      try {
        await rt.CloudDatabase.saveFile(userId, "s3-fail", "a.txt", "text/plain", "h1", Buffer.alloc(400, 65));
      } catch (e) {
        s3Err = e;
      }
      expect(String(s3Err)).toContain("SIMULATED_S3_PUT_FAILURE");
      const activeAfterS3Fail = await adminPool.query<{ c: string }>(
        "SELECT COUNT(*)::text AS c FROM storage_reservations WHERE user_id=$1 AND status='reserved'",
        [userId],
      );
      expect(Number(activeAfterS3Fail.rows[0].c)).toBe(0);

      // 2) S3 put sucede, mas PostgreSQL falha no commit -> compensação remove objeto órfão do S3 e libera reserva!
      failS3Put = false;
      await adminPool.query(`
        CREATE OR REPLACE FUNCTION ${triggerFn}() RETURNS trigger AS $$
        BEGIN
          IF NEW.user_id = '${userId}' AND NEW.id = 'pg-fail' THEN
            RAISE EXCEPTION 'SIMULATED_PG_FILES_FAILURE';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER ${triggerFn}_trg BEFORE INSERT ON files
        FOR EACH ROW EXECUTE FUNCTION ${triggerFn}();
      `);

      let pgErr: unknown;
      try {
        await rt.CloudDatabase.saveFile(userId, "pg-fail", "b.txt", "text/plain", "h2", Buffer.alloc(400, 66));
      } catch (e) {
        pgErr = e;
      }
      expect(String(pgErr)).toContain("SIMULATED_PG_FILES_FAILURE");
      expect(s3Objects.size).toBe(0);
      expect(s3Deletes).toEqual([`users/${userId}/materials/pg-fail/h2`]);

      const activeAfterPgFail = await adminPool.query<{ c: string }>(
        "SELECT COUNT(*)::text AS c FROM storage_reservations WHERE user_id=$1 AND status='reserved'",
        [userId],
      );
      expect(Number(activeAfterPgFail.rows[0].c)).toBe(0);

      // 3) Reserva abandonada expirada é reclamada pelo OperationalCleanup
      await adminPool.query(
        `INSERT INTO storage_reservations (id, user_id, kind, resource_id, reserved_bytes, status, expires_at)
         VALUES ('abandoned-res', $1, 'files', 'orphan', 900, 'reserved', NOW() - INTERVAL '5 minutes')`,
        [userId],
      );
      await rt.OperationalCleanup.run({ batchLimit: 100 });
      const statusAfterCleanup = await adminPool.query<{ status: string }>(
        "SELECT status FROM storage_reservations WHERE id='abandoned-res'",
      );
      expect(statusAfterCleanup.rows[0].status).toBe("expired");
    } finally {
      await adminPool.query(`DROP TRIGGER IF EXISTS ${triggerFn}_trg ON files; DROP FUNCTION IF EXISTS ${triggerFn}();`).catch(() => undefined);
      await adminPool.query("DELETE FROM users WHERE id = $1", [userId]).catch(() => undefined);
      await rt.postgresPool().end().catch(() => undefined);
      await adminPool.end().catch(() => undefined);
    }
  });
});
