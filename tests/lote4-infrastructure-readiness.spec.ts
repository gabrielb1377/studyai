import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const testRequire = createRequire(__filename);

function isDisposableLocalPostgres(url: string | undefined): boolean {
  if (!url || process.env.STUDYAI_ALLOW_LOCAL_DB_TESTS !== "1") return false;
  try {
    const parsed = new URL(url);
    return parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  } catch {
    return false;
  }
}

class FakeNextResponse extends Response {
  static json(data: unknown, init?: ResponseInit) {
    return new Response(JSON.stringify(data), {
      status: init?.status ?? 200,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
  }
}

function loadModule(
  file: string,
  dependencies: Record<string, unknown>,
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
  const compiledModule = { exports: {} as Record<string, unknown> };
  const fakeRequire = (id: string) => (id in dependencies ? dependencies[id] : testRequire(id));
  vm.runInContext(
    js,
    vm.createContext({
      module: compiledModule,
      exports: compiledModule.exports,
      require: fakeRequire,
      Buffer,
      Date,
      Math,
      JSON,
      Map,
      Set,
      Promise,
      Number,
      String,
      Boolean,
      Object,
      Array,
      Error,
      TypeError,
      RegExp,
      URL,
      URLSearchParams,
      Headers,
      Request,
      Response,
      TextEncoder,
      TextDecoder,
      ReadableStream,
      AbortController,
      performance,
      console,
      setTimeout,
      clearTimeout,
      process,
      globalThis,
      ...globals,
    }),
    { filename: file },
  );
  return compiledModule.exports;
}

test.describe("Lote 4 — Contratos de TLS, Proxy, Healthchecks, S3 e SMTP", () => {
  test("4A: Postgres.ts normaliza DATABASE_CA_CERT com \\n escapado, valida TLS por padrão e exige tabelas Lote 3 em postgresHealth", async () => {
    const capturedPoolConfigs: Array<Record<string, unknown>> = [];
    const warnings: string[] = [];
    let schemaReadyResult = false;
    let lastHealthSql = "";

    class FakePool {
      constructor(config: Record<string, unknown>) {
        capturedPoolConfigs.push(config);
      }
      on() {
        return this;
      }
      async query(sql: string) {
        lastHealthSql = sql;
        return { rows: [{ schema_ready: schemaReadyResult }] };
      }
      async end() {
        return undefined;
      }
    }

    const fakeEnv: Record<string, string | undefined> = {
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://user:pass@db.example.test:5432/studyai",
      DATABASE_CA_CERT: "-----BEGIN CERTIFICATE-----\\nMIIBTEST\\n-----END CERTIFICATE-----",
    };

    const pgMod = loadModule(
      "src/server/database/Postgres.ts",
      {
        "server-only": {},
        pg: { Pool: FakePool },
      },
      {
        process: { ...process, env: fakeEnv },
        globalThis: {},
        console: { ...console, warn: (msg: string) => warnings.push(msg), error: () => undefined },
      },
    ) as {
      postgresPool: () => unknown;
      postgresHealth: () => Promise<{ available: boolean; schemaReady: boolean; tlsVerificationEnabled?: boolean }>;
    };

    pgMod.postgresPool();
    expect(capturedPoolConfigs).toHaveLength(1);
    const ssl = capturedPoolConfigs[0].ssl as { rejectUnauthorized: boolean; ca?: string };
    expect(ssl.rejectUnauthorized).toBe(true);
    expect(ssl.ca).toBe("-----BEGIN CERTIFICATE-----\nMIIBTEST\n-----END CERTIFICATE-----");
    expect(warnings).toHaveLength(0);

    const h1 = await pgMod.postgresHealth();
    expect(h1.available).toBe(true);
    expect(h1.schemaReady).toBe(false);
    expect(h1.tlsVerificationEnabled).toBe(true);
    expect(lastHealthSql).toContain("ai_global_daily_budgets");
    expect(lastHealthSql).toContain("ai_token_reservations");
    expect(lastHealthSql).toContain("storage_reservations");

    schemaReadyResult = true;
    const h2 = await pgMod.postgresHealth();
    expect(h2.schemaReady).toBe(true);

    // Warning explícito quando DATABASE_SSL_REJECT_UNAUTHORIZED=false em produção
    fakeEnv.DATABASE_URL = "postgresql://user:pass@db2.example.test:5432/studyai";
    fakeEnv.DATABASE_SSL_REJECT_UNAUTHORIZED = "false";
    pgMod.postgresPool();
    expect(warnings.some((w) => w.includes("DATABASE_SSL_REJECT_UNAUTHORIZED=false"))).toBe(true);
  });

  test("4B: /api/health/live responde 200 sem banco; /api/health falha fechado sem proxy confiável/DB/S3 em produção e expõe emailConfigured", async () => {
    const liveMod = loadModule("src/app/api/health/live/route.ts", {
      "next/server": { NextResponse: FakeNextResponse },
      "../../../../../package.json": { version: "0.4.0" },
    }) as { GET: () => Promise<Response> };

    const liveRes = await liveMod.GET();
    expect(liveRes.status).toBe(200);
    const liveJson = (await liveRes.json()) as { status: string; check: string };
    expect(liveJson.status).toBe("ok");
    expect(liveJson.check).toBe("liveness");

    const fakeEnv: Record<string, string | undefined> = {
      NODE_ENV: "production",
      APP_URL: "https://studyai.example.com",
      TRUST_PROXY_HEADERS: undefined,
    };

    const rateLimitMod = loadModule(
      "src/server/security/RateLimit.ts",
      {
        "server-only": {},
        "./RateLimitService": { RateLimitService: {} },
      },
      { process: { ...process, env: fakeEnv }, console: { ...console, error: () => undefined } },
    ) as { clientAddressSource: () => string; requestAddress: (req: Request) => string };

    // Sem proxy confiável, cliente não consegue forjar X-Forwarded-For
    const spoofed = new Request("https://studyai.example.com/auth/login", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(rateLimitMod.requestAddress(spoofed)).toBe("local");

    const healthMod = loadModule(
      "src/app/api/health/route.ts",
      {
        "next/server": { NextResponse: FakeNextResponse },
        "../../../../package.json": { version: "0.4.0" },
        "@/server/database/Postgres": {
          postgresHealth: async () => ({ available: true, configured: true, schemaReady: true, mode: "postgres", latencyMs: 3 }),
        },
        "@/server/storage/ObjectStorage": {
          ObjectStorage: { health: async () => ({ available: true, mode: "s3", latencyMs: 8 }) },
        },
        "@/server/observability/Telemetry": { Telemetry: { snapshot: () => ({}) } },
        "@/server/security/RateLimit": rateLimitMod,
        "@/server/auth/EmailService": { EmailService: { configured: () => false } },
      },
      { process: { ...process, env: fakeEnv } },
    ) as { GET: (req: Request) => Promise<Response> };

    // Sem TRUST_PROXY_HEADERS em produção -> 503 degraded
    const resDegraded = await healthMod.GET(new Request("https://studyai.example.com/api/health"));
    expect(resDegraded.status).toBe(503);
    const bodyDegraded = (await resDegraded.json()) as {
      status: string;
      checks: { application: { clientAddressConfigured: boolean; emailConfigured: boolean } };
    };
    expect(bodyDegraded.status).toBe("degraded");
    expect(bodyDegraded.checks.application.clientAddressConfigured).toBe(false);
    expect(bodyDegraded.checks.application.emailConfigured).toBe(false);

    // Com TRUST_PROXY_HEADERS=true e TRUSTED_PROXY_HOPS=1 -> usa hop confiável da direita e responde 200 ok
    fakeEnv.TRUST_PROXY_HEADERS = "true";
    fakeEnv.TRUSTED_PROXY_HOPS = "1";
    expect(rateLimitMod.requestAddress(spoofed)).toBe("5.6.7.8");
    const resOk = await healthMod.GET(new Request("https://studyai.example.com/api/health"));
    expect(resOk.status).toBe(200);
    const bodyOk = (await resOk.json()) as { status: string };
    expect(bodyOk.status).toBe("ok");
  });

  test("4C: EmailService exige STARTTLS em produção, aceita alias SMTP_PASS e /auth/verify/resend aplica CSRF, rate-limit e não vaza token em produção", async () => {
    const transports: Array<Record<string, unknown>> = [];
    const sentMails: Array<Record<string, unknown>> = [];

    const fakeEnv: Record<string, string | undefined> = {
      NODE_ENV: "production",
      SMTP_HOST: "smtp.example.test",
      SMTP_PORT: "587",
      SMTP_USER: "postmaster@example.test",
      SMTP_PASS: "smtp-test-secret",
      SMTP_FROM: "StudyAI <no-reply@example.test>",
    };

    const emailMod = loadModule(
      "src/server/auth/EmailService.ts",
      {
        "server-only": {},
        nodemailer: {
          createTransport: (cfg: Record<string, unknown>) => {
            transports.push(cfg);
            return {
              sendMail: async (mail: Record<string, unknown>) => {
                sentMails.push(mail);
                return { messageId: "mock-1" };
              },
            };
          },
        },
      },
      { process: { ...process, env: fakeEnv } },
    ) as {
      EmailService: {
        configured: () => boolean;
        requireConfiguration: () => void;
        sendVerification: (email: string, token: string, origin: string) => Promise<boolean>;
      };
    };

    expect(emailMod.EmailService.configured()).toBe(true);
    await emailMod.EmailService.sendVerification("aluna@example.test", "tok-verify-123", "https://studyai.example.com");
    expect(transports).toHaveLength(1);
    expect(transports[0].secure).toBe(false);
    expect(transports[0].requireTLS).toBe(true);
    expect((transports[0].auth as { pass: string }).pass).toBe("smtp-test-secret");
    expect(sentMails[0].from).toBe("StudyAI <no-reply@example.test>");
    expect(String(sentMails[0].text)).toContain("https://studyai.example.com/conta?verify=tok-verify-123");

    // Rota POST /auth/verify/resend
    let rateCount = 0;
    const resendMod = loadModule(
      "src/app/auth/verify/resend/route.ts",
      {
        "next/server": { NextResponse: FakeNextResponse },
        "@/server/auth/AuthService": {
          AuthService: {
            resendVerification: async () => ({
              alreadyVerified: false,
              email: "aluna@example.test",
              verificationToken: "tok-resend-secret",
            }),
          },
        },
        "@/server/auth/EmailService": emailMod,
        "@/server/auth/http": {
          requireCsrf: (req: Request) => {
            if (!req.headers.get("x-csrf-token")) {
              throw new Response(JSON.stringify({ error: "CSRF_INVALID" }), { status: 403 });
            }
          },
          requireUser: () => ({ sub: "u-resend-1", email: "aluna@example.test", sessionId: "s-1" }),
          requireActiveSession: async () => undefined,
          publicOrigin: () => "https://studyai.example.com",
          apiError: (err: unknown) => (err instanceof Response ? err : FakeNextResponse.json({ error: String(err) }, { status: 400 })),
        },
        "@/server/security/RateLimit": {
          requestAddress: () => "198.51.100.42",
          rateLimitStrict: async (key: string) => {
            if (key.startsWith("verify-resend-user:")) {
              rateCount += 1;
              const allowed = rateCount <= 3;
              return { allowed, remaining: Math.max(0, 3 - rateCount), limit: 3, resetAt: new Date(Date.now() + 60_000).toISOString(), retryAfter: 60 };
            }
            return { allowed: true, remaining: 4, limit: 5, resetAt: new Date(Date.now() + 60_000).toISOString() };
          },
        },
        "@/server/security/RateLimitHttp": {
          rateLimitRejection: (_d: unknown, msg: string) => FakeNextResponse.json({ error: msg }, { status: 429 }),
        },
      },
      { process: { ...process, env: fakeEnv } },
    ) as { POST: (req: Request) => Promise<Response> };

    // Sem CSRF -> 403
    const noCsrf = await resendMod.POST(new Request("https://studyai.example.com/auth/verify/resend", { method: "POST" }));
    expect(noCsrf.status).toBe(403);

    // 3 envios válidos -> 200 e token oculto em produção
    for (let i = 0; i < 3; i += 1) {
      const ok = await resendMod.POST(
        new Request("https://studyai.example.com/auth/verify/resend", {
          method: "POST",
          headers: { "x-csrf-token": "valid-csrf" },
        }),
      );
      expect(ok.status).toBe(200);
      const body = (await ok.json()) as { ok: boolean; verificationToken?: string };
      expect(body.ok).toBe(true);
      expect(body.verificationToken).toBeUndefined();
    }

    // 4a tentativa -> 429 rate limit
    const limited = await resendMod.POST(
      new Request("https://studyai.example.com/auth/verify/resend", {
        method: "POST",
        headers: { "x-csrf-token": "valid-csrf" },
      }),
    );
    expect(limited.status).toBe(429);
  });

  test("4D: ObjectStorage isola chaves por usuário, sanitiza traversal, aplica CacheControl privado + AES256 e falha fechado em produção sem S3", async () => {
    const sentCommands: Array<{ name: string; input: Record<string, unknown> }> = [];
    const fakeEnv: Record<string, string | undefined> = {
      NODE_ENV: "production",
    };

    const makeMod = () =>
      loadModule(
        "src/server/storage/ObjectStorage.ts",
        {
          "server-only": {},
          "@/server/observability/Telemetry": { Telemetry: { measure: (_n: string, fn: () => Promise<unknown>) => fn() } },
          "@aws-sdk/client-s3": {
            S3Client: class {
              async send(cmd: { name: string; input: Record<string, unknown> }) {
                sentCommands.push(cmd);
                return { Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) } };
              }
            },
            PutObjectCommand: class {
              name = "PutObjectCommand";
              constructor(public input: Record<string, unknown>) {}
            },
            GetObjectCommand: class {
              name = "GetObjectCommand";
              constructor(public input: Record<string, unknown>) {}
            },
            DeleteObjectCommand: class {
              name = "DeleteObjectCommand";
              constructor(public input: Record<string, unknown>) {}
            },
            HeadBucketCommand: class {
              name = "HeadBucketCommand";
              constructor(public input: Record<string, unknown>) {}
            },
          },
        },
        { process: { ...process, env: fakeEnv } },
      ) as {
        ObjectStorage: {
          mode: (opts?: { allowMissing?: boolean }) => string;
          key: (userId: string, id: string, hash: string) => string;
          put: (key: string, content: Buffer, contentType: string) => Promise<void>;
        };
      };

    const missingMod = makeMod();
    expect(() => missingMod.ObjectStorage.mode()).toThrow(/Object Storage não configurado/);

    fakeEnv.S3_BUCKET = "studyai-files-test";
    fakeEnv.S3_ACCESS_KEY_ID = "test-key";
    fakeEnv.S3_SECRET_ACCESS_KEY = "test-secret";
    fakeEnv.S3_ENDPOINT = "https://t3.storageapi.dev";
    fakeEnv.S3_REGION = "auto";
    fakeEnv.S3_FORCE_PATH_STYLE = "false";

    const okMod = makeMod();
    expect(okMod.ObjectStorage.mode()).toBe("s3");
    const safeKey = okMod.ObjectStorage.key("user/../../admin", "file/../x", "abc123");
    expect(safeKey).toBe("users/user_.._.._admin/materials/file_.._x/abc123");
    expect(safeKey).not.toContain("../");

    await okMod.ObjectStorage.put(safeKey, Buffer.from("pdf-data"), "application/pdf");
    expect(sentCommands).toHaveLength(1);
    expect(sentCommands[0].input.CacheControl).toBe("private, max-age=31536000, immutable");
    expect(sentCommands[0].input.ServerSideEncryption).toBe("AES256");
  });
});

test.describe("Lote 4 — PostgreSQL real (ensaio migrations 0001–0003, rollback e expiração mid-request)", () => {
  const databaseUrl = process.env.DATABASE_URL;
  test.skip(
    !isDisposableLocalPostgres(databaseUrl),
    "Requer PostgreSQL local descartável (DATABASE_URL loopback + STUDYAI_ALLOW_LOCAL_DB_TESTS=1).",
  );

  test("PG4-1: ensaio em banco limpo e em schema legado pré-0001 com preservação de dados, 35 tabelas e rollback seguro", async () => {
    const pg = testRequire("pg") as typeof import("pg");
    const adminPool = new pg.Pool({ connectionString: databaseUrl, max: 2, ssl: false });
    const freshDb = `studyai_l4_fresh_${Date.now()}`;
    const legacyDb = `studyai_l4_legacy_${Date.now()}`;

    const baseUrl = new URL(databaseUrl!);
    const makeDbUrl = (name: string) => {
      const copy = new URL(baseUrl.toString());
      copy.pathname = `/${name}`;
      return copy.toString();
    };

    const schemaSql = readFileSync(path.join(process.cwd(), "src/server/database/schema.sql"), "utf8");
    const m0001 = readFileSync(path.join(process.cwd(), "migrations/0001_exam_attempts.sql"), "utf8");
    const m0002 = readFileSync(path.join(process.cwd(), "migrations/0002_lote2_atomicity_and_indexes.sql"), "utf8");
    const m0003 = readFileSync(path.join(process.cwd(), "migrations/0003_lote3_ai_budgets_and_storage_quotas.sql"), "utf8");
    const rb0001 = readFileSync(path.join(process.cwd(), "migrations/0001_exam_attempts.rollback.sql"), "utf8");
    const rb0002 = readFileSync(path.join(process.cwd(), "migrations/0002_lote2_atomicity_and_indexes.rollback.sql"), "utf8");
    const rb0003 = readFileSync(path.join(process.cwd(), "migrations/0003_lote3_ai_budgets_and_storage_quotas.rollback.sql"), "utf8");

    await adminPool.query(`CREATE DATABASE ${freshDb}`);
    await adminPool.query(`CREATE DATABASE ${legacyDb}`);

    const freshPool = new pg.Pool({ connectionString: makeDbUrl(freshDb), max: 2, ssl: false });
    const legacyPool = new pg.Pool({ connectionString: makeDbUrl(legacyDb), max: 2, ssl: false });

    try {
      // 1) Banco novo: aplicar schema.sql duas vezes -> exatamente 35 tabelas e RLS em exam_attempts
      await freshPool.query(schemaSql);
      await freshPool.query(schemaSql);
      const freshTables = await freshPool.query<{ tablename: string }>(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
      );
      expect(freshTables.rows.length).toBe(35);
      const rlsRow = await freshPool.query<{ relrowsecurity: boolean }>(
        "SELECT relrowsecurity FROM pg_class WHERE oid = 'public.exam_attempts'::regclass",
      );
      expect(rlsRow.rows[0]?.relrowsecurity).toBe(true);

      // 2) Banco legado pré-0001 (31 tabelas: sem exam_attempts, sem 0002, sem 0003)
      await legacyPool.query(schemaSql);
      await legacyPool.query(rb0003);
      await legacyPool.query(rb0002);
      await legacyPool.query(rb0001);
      await legacyPool.query("ALTER TABLE usage_quotas DROP COLUMN IF EXISTS reserved_tokens");
      await legacyPool.query("ALTER TABLE refresh_tokens DROP COLUMN IF EXISTS family_id, DROP COLUMN IF EXISTS replaced_by, DROP COLUMN IF EXISTS rotated_at");

      const legacyBefore = await legacyPool.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM pg_tables WHERE schemaname = 'public'",
      );
      expect(Number(legacyBefore.rows[0].count)).toBe(31);

      // Semear dados legados antes do upgrade
      await legacyPool.query("INSERT INTO users (id, email, password_hash, email_verified_at) VALUES ('u-leg', 'leg@example.test', 'hash', NOW())");
      await legacyPool.query(
        "INSERT INTO refresh_tokens (id, user_id, token_hash, device_id, device_name, expires_at) VALUES ('rt-leg', 'u-leg', 'th-leg', 'dev-leg', 'Browser', NOW() + INTERVAL '7 days')",
      );
      await legacyPool.query(
        "INSERT INTO usage_quotas (user_id, date, minute_bucket, requests_count, tokens_count) VALUES ('u-leg', CURRENT_DATE, 0, 12, 4500)",
      );

      // Aplicar migrations 0001 -> 0002 -> 0003 em ordem e reaplicar (idempotência)
      for (const sql of [m0001, m0002, m0003, m0001, m0002, m0003]) {
        await legacyPool.query(sql);
      }
      const legacyAfter = await legacyPool.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM pg_tables WHERE schemaname = 'public'",
      );
      expect(Number(legacyAfter.rows[0].count)).toBe(35);

      // Dados legados preservados integralmente
      const quotaAfter = await legacyPool.query<{ requests_count: string; tokens_count: string; reserved_tokens: string }>(
        "SELECT requests_count::text, tokens_count::text, reserved_tokens::text FROM usage_quotas WHERE user_id = 'u-leg' AND minute_bucket = 0",
      );
      expect({
        requests_count: Number(quotaAfter.rows[0].requests_count),
        tokens_count: Number(quotaAfter.rows[0].tokens_count),
        reserved_tokens: Number(quotaAfter.rows[0].reserved_tokens),
      }).toEqual({ requests_count: 12, tokens_count: 4500, reserved_tokens: 0 });
      const rtAfter = await legacyPool.query<{ id: string }>("SELECT id FROM refresh_tokens WHERE id = 'rt-leg'");
      expect(rtAfter.rowCount).toBe(1);

      // Ensaio de rollback reverso (0003 -> 0002 -> 0001): preserva dados base
      await legacyPool.query(rb0003);
      await legacyPool.query(rb0002);
      await legacyPool.query(rb0001);
      const userAfterRollback = await legacyPool.query<{ id: string }>("SELECT id FROM users WHERE id = 'u-leg'");
      expect(userAfterRollback.rowCount).toBe(1);
      const rtAfterRollback = await legacyPool.query<{ id: string }>("SELECT id FROM refresh_tokens WHERE id = 'rt-leg'");
      expect(rtAfterRollback.rowCount).toBe(1);

      // Reaplicação após rollback funciona limpo
      await legacyPool.query(m0001);
      await legacyPool.query(m0002);
      await legacyPool.query(m0003);
      const finalCount = await legacyPool.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM pg_tables WHERE schemaname = 'public'",
      );
      expect(Number(finalCount.rows[0].count)).toBe(35);
    } finally {
      await freshPool.end().catch(() => undefined);
      await legacyPool.end().catch(() => undefined);
      await adminPool.query(`DROP DATABASE IF EXISTS ${freshDb} WITH (FORCE)`).catch(() => undefined);
      await adminPool.query(`DROP DATABASE IF EXISTS ${legacyDb} WITH (FORCE)`).catch(() => undefined);
      await adminPool.end().catch(() => undefined);
    }
  });

  test("PG4-2: reserva expirada durante requisição lenta ainda contabiliza tokens reais na reconciliação sem decremento duplo", async () => {
    const pg = testRequire("pg") as typeof import("pg");
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 3, ssl: false });
    const userId = `pg4_exp_${Date.now()}`;
    const today = new Date().toISOString().slice(0, 10);

    try {
      const schemaSql = readFileSync(path.join(process.cwd(), "src/server/database/schema.sql"), "utf8");
      await pool.query(schemaSql);
      await pool.query("INSERT INTO users (id, email, password_hash, email_verified_at) VALUES ($1, $2, 'hash', NOW())", [
        userId,
        `${userId}@example.test`,
      ]);
      await pool.query("DELETE FROM ai_global_daily_budgets WHERE date = $1::date", [today]);

      const pgAdapter = {
        hasPostgres: () => true,
        query: (sql: string, params?: unknown[]) => pool.query(sql, params),
        transaction: async <T>(fn: (client: import("pg").PoolClient) => Promise<T>) => {
          const client = await pool.connect();
          try {
            await client.query("BEGIN");
            const out = await fn(client);
            await client.query("COMMIT");
            return out;
          } catch (err) {
            await client.query("ROLLBACK");
            throw err;
          } finally {
            client.release();
          }
        },
      };

      const quotaMod = loadModule(
        "src/server/ai/QuotaService.ts",
        {
          "@/server/database/Postgres": pgAdapter,
        },
        {
          process: {
            ...process,
            env: {
              ...process.env,
              AI_USER_DAILY_TOKEN_LIMIT: "100000",
              AI_GLOBAL_DAILY_TOKEN_BUDGET: "500000",
            },
          },
        },
      ) as {
        QuotaService: {
          reserveSharedBudget: (
            uid: string,
            opts: { provider: string; model?: string; requestId?: string; reserveTokens: number; useSharedKeys: boolean },
          ) => Promise<{ allowed: boolean; reservationId?: string }>;
          reconcileReservation: (
            id: string,
            settlement: { outcome: "completed"; provider: string; model?: string; usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number; source?: "provider" }; emittedOutput: boolean; providerContacted: boolean },
          ) => Promise<{ reconciled: boolean; alreadySettled?: boolean; chargedTokens: number }>;
          cleanupExpired: (retainDays?: number) => Promise<number>;
        };
      };

      const res = await quotaMod.QuotaService.reserveSharedBudget(userId, {
        provider: "gemini",
        model: "gemini-2.5-flash",
        requestId: `req-slow-${Date.now()}`,
        reserveTokens: 2000,
        useSharedKeys: true,
      });
      expect(res.allowed).toBe(true);
      expect(res.reservationId).toBeTruthy();

      // Simular expiração enquanto a chamada lenta ainda está em andamento
      await pool.query("UPDATE ai_token_reservations SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1", [
        res.reservationId,
      ]);
      await quotaMod.QuotaService.cleanupExpired(7);

      const midStatus = await pool.query<{ status: string }>(
        "SELECT status FROM ai_token_reservations WHERE id = $1",
        [res.reservationId],
      );
      expect(midStatus.rows[0]?.status).toBe("expired");

      // A chamada lenta finalmente termina com 3450 tokens reais -> MUST STILL CHARGE 3450!
      const settled1 = await quotaMod.QuotaService.reconcileReservation(res.reservationId!, {
        outcome: "completed",
        provider: "gemini",
        model: "gemini-2.5-flash",
        usage: { inputTokens: 2000, outputTokens: 1450, totalTokens: 3450, source: "provider" },
        emittedOutput: true,
        providerContacted: true,
      });
      expect(settled1.reconciled).toBe(true);
      expect(settled1.chargedTokens).toBe(3450);

      // Segunda reconciliação continua estritamente idempotente
      const settled2 = await quotaMod.QuotaService.reconcileReservation(res.reservationId!, {
        outcome: "completed",
        provider: "gemini",
        model: "gemini-2.5-flash",
        usage: { inputTokens: 2000, outputTokens: 1450, totalTokens: 3450, source: "provider" },
        emittedOutput: true,
        providerContacted: true,
      });
      expect(settled2.alreadySettled).toBe(true);
      expect(settled2.chargedTokens).toBe(0);

      const userRow = await pool.query<{ tokens_count: string; reserved_tokens: string }>(
        "SELECT tokens_count::text, reserved_tokens::text FROM usage_quotas WHERE user_id = $1 AND date = $2::date AND minute_bucket = 0",
        [userId, today],
      );
      expect(Number(userRow.rows[0].tokens_count)).toBe(3450);
      expect(Number(userRow.rows[0].reserved_tokens)).toBe(0);

      const globalRow = await pool.query<{ consumed_tokens: string; reserved_tokens: string }>(
        "SELECT consumed_tokens::text, reserved_tokens::text FROM ai_global_daily_budgets WHERE date = $1::date",
        [today],
      );
      expect(Number(globalRow.rows[0].consumed_tokens)).toBe(3450);
      expect(Number(globalRow.rows[0].reserved_tokens)).toBe(0);
    } finally {
      await pool.query("DELETE FROM users WHERE id = $1", [userId]).catch(() => undefined);
      await pool.query("DELETE FROM ai_global_daily_budgets WHERE date = $1::date", [today]).catch(() => undefined);
      await pool.end().catch(() => undefined);
    }
  });

  test("PG4-3: concorrência multi-pool com reserva expirada ativa + nova reserva simultânea + dupla reconciliação racing", async () => {
    const pg = testRequire("pg") as typeof import("pg");
    const poolA = new pg.Pool({ connectionString: databaseUrl, max: 3, ssl: false });
    const poolB = new pg.Pool({ connectionString: databaseUrl, max: 3, ssl: false });
    const userId = `pg4_conc_${Date.now()}`;
    const today = new Date().toISOString().slice(0, 10);

    const makeQuotaMod = (pool: import("pg").Pool) => {
      const pgAdapter = {
        hasPostgres: () => true,
        query: (sql: string, params?: unknown[]) => pool.query(sql, params),
        transaction: async <T>(fn: (client: import("pg").PoolClient) => Promise<T>) => {
          const client = await pool.connect();
          try {
            await client.query("BEGIN");
            const out = await fn(client);
            await client.query("COMMIT");
            return out;
          } catch (err) {
            await client.query("ROLLBACK");
            throw err;
          } finally {
            client.release();
          }
        },
      };
      return loadModule(
        "src/server/ai/QuotaService.ts",
        { "@/server/database/Postgres": pgAdapter },
        {
          process: {
            ...process,
            env: {
              ...process.env,
              AI_USER_DAILY_TOKEN_LIMIT: "10000",
              AI_GLOBAL_DAILY_TOKEN_BUDGET: "5000",
            },
          },
        },
      ) as {
        QuotaService: {
          reserveSharedBudget: (
            uid: string,
            opts: { provider: string; model?: string; requestId?: string; reserveTokens: number; useSharedKeys: boolean },
          ) => Promise<{ allowed: boolean; blockedBy?: string; reservationId?: string }>;
          reconcileReservation: (
            id: string,
            settlement: {
              outcome: "completed";
              provider: string;
              model?: string;
              usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number; source?: "provider" };
              emittedOutput: boolean;
              providerContacted: boolean;
            },
          ) => Promise<{ reconciled: boolean; alreadySettled?: boolean; chargedTokens: number }>;
        };
      };
    };

    try {
      const schemaSql = readFileSync(path.join(process.cwd(), "src/server/database/schema.sql"), "utf8");
      await poolA.query(schemaSql);
      await poolA.query("INSERT INTO users (id, email, password_hash, email_verified_at) VALUES ($1, $2, 'hash', NOW())", [
        userId,
        `${userId}@example.test`,
      ]);
      await poolA.query("DELETE FROM ai_global_daily_budgets WHERE date = $1::date", [today]);

      const modA = makeQuotaMod(poolA);
      const modB = makeQuotaMod(poolB);

      // 1) Req A reserva 2500 em poolA e expira enquanto ainda está ativa
      const resA = await modA.QuotaService.reserveSharedBudget(userId, {
        provider: "gemini",
        model: "gemini-2.5-flash",
        requestId: `conc-a-${Date.now()}`,
        reserveTokens: 2500,
        useSharedKeys: true,
      });
      expect(resA.allowed).toBe(true);
      await poolA.query("UPDATE ai_token_reservations SET expires_at = NOW() - INTERVAL '30 seconds' WHERE id = $1", [
        resA.reservationId,
      ]);

      // 2) Req B reserva 2500 em poolB (reclama automaticamente resA expirada)
      const resB = await modB.QuotaService.reserveSharedBudget(userId, {
        provider: "gemini",
        model: "gemini-2.5-flash",
        requestId: `conc-b-${Date.now()}`,
        reserveTokens: 2500,
        useSharedKeys: true,
      });
      expect(resB.allowed).toBe(true);

      // 3) Corrida simultânea entre 2 pools: duas reconciliações concorrentes em resA (expirada) + reconciliação de resB
      const [sA1, sA2, sB] = await Promise.all([
        modA.QuotaService.reconcileReservation(resA.reservationId!, {
          outcome: "completed",
          provider: "gemini",
          model: "gemini-2.5-flash",
          usage: { inputTokens: 1500, outputTokens: 1200, totalTokens: 2700, source: "provider" },
          emittedOutput: true,
          providerContacted: true,
        }),
        modB.QuotaService.reconcileReservation(resA.reservationId!, {
          outcome: "completed",
          provider: "gemini",
          model: "gemini-2.5-flash",
          usage: { inputTokens: 1500, outputTokens: 1200, totalTokens: 2700, source: "provider" },
          emittedOutput: true,
          providerContacted: true,
        }),
        modB.QuotaService.reconcileReservation(resB.reservationId!, {
          outcome: "completed",
          provider: "gemini",
          model: "gemini-2.5-flash",
          usage: { inputTokens: 1400, outputTokens: 1200, totalTokens: 2600, source: "provider" },
          emittedOutput: true,
          providerContacted: true,
        }),
      ]);

      // Exatamente uma reconciliação de resA vence; nenhuma cobrança dupla
      const aWinners = [sA1, sA2].filter((item) => item.reconciled);
      const aDuplicates = [sA1, sA2].filter((item) => item.alreadySettled);
      expect(aWinners).toHaveLength(1);
      expect(aDuplicates).toHaveLength(1);
      expect(aWinners[0].chargedTokens).toBe(2700);
      expect(sB.reconciled).toBe(true);
      expect(sB.chargedTokens).toBe(2600);

      // 4) Saldo final exato (2700 + 2600 = 5300), reserved_tokens = 0, e Req C imediatamente bloqueada
      const globalRow = await poolA.query<{ consumed_tokens: string; reserved_tokens: string }>(
        "SELECT consumed_tokens::text, reserved_tokens::text FROM ai_global_daily_budgets WHERE date = $1::date",
        [today],
      );
      expect(Number(globalRow.rows[0].consumed_tokens)).toBe(5300);
      expect(Number(globalRow.rows[0].reserved_tokens)).toBe(0);

      const userRow = await poolA.query<{ tokens_count: string; reserved_tokens: string }>(
        "SELECT tokens_count::text, reserved_tokens::text FROM usage_quotas WHERE user_id = $1 AND date = $2::date AND minute_bucket = 0",
        [userId, today],
      );
      expect(Number(userRow.rows[0].tokens_count)).toBe(5300);
      expect(Number(userRow.rows[0].reserved_tokens)).toBe(0);

      const resC = await modA.QuotaService.reserveSharedBudget(userId, {
        provider: "gemini",
        model: "gemini-2.5-flash",
        requestId: `conc-c-${Date.now()}`,
        reserveTokens: 500,
        useSharedKeys: true,
      });
      expect(resC.allowed).toBe(false);
      expect(resC.blockedBy).toBe("global_budget");
    } finally {
      await poolA.query("DELETE FROM users WHERE id = $1", [userId]).catch(() => undefined);
      await poolA.query("DELETE FROM ai_global_daily_budgets WHERE date = $1::date", [today]).catch(() => undefined);
      await poolA.end().catch(() => undefined);
      await poolB.end().catch(() => undefined);
    }
  });
});
