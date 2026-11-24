import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
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
      performance,
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

function createServerRuntime(databaseUrl: string) {
  const env: Record<string, string | undefined> = {
    NODE_ENV: "test",
    DATABASE_URL: databaseUrl,
    DATABASE_SSL: "false",
    AUTH_SECRET: "lote2-test-auth-secret-with-at-least-32-chars!!",
  };
  const sharedGlobals = {
    process: { env },
    console: { ...console, warn: () => undefined, info: () => undefined },
  };
  const pgMod = loadModule("src/server/database/Postgres.ts", {}, sharedGlobals);
  const cryptoCore = loadModule("src/server/security/crypto-core.ts", {}, sharedGlobals);
  const cryptoMod = loadModule("src/server/security/Crypto.ts", {
    "./crypto-core": cryptoCore,
  }, sharedGlobals);
  const conflictMod = loadModule("src/server/cloud/ConflictResolver.ts", {}, sharedGlobals);
  const typesMod = loadModule("src/server/cloud/types.ts", {}, sharedGlobals);
  const cloudDbMod = loadModule("src/server/cloud/CloudDatabase.ts", {
    "@/server/database/Postgres": pgMod,
    "@/server/storage/ObjectStorage": { ObjectStorage: { mode: () => "database" } },
    "./ConflictResolver": conflictMod,
    "./types": typesMod,
  }, sharedGlobals);
  const authMod = loadModule("src/server/auth/AuthService.ts", {
    "@/server/cloud/CloudDatabase": cloudDbMod,
    "@/server/database/Postgres": pgMod,
    "@/server/security/Crypto": cryptoMod,
  }, sharedGlobals);
  const syncMod = loadModule("src/server/cloud/SyncService.ts", {
    "./CloudDatabase": cloudDbMod,
    "./ConflictResolver": conflictMod,
  }, sharedGlobals);
  const collabDbMod = loadModule("src/server/collaboration/CollaborationDatabase.ts", {
    "@/server/database/Postgres": pgMod,
  }, sharedGlobals);
  const rateLimitMod = loadModule("src/server/security/RateLimitService.ts", {
    "@/server/database/Postgres": pgMod,
  }, sharedGlobals);
  const quotaMod = loadModule("src/server/ai/QuotaService.ts", {
    "@/server/database/Postgres": pgMod,
  }, sharedGlobals);
  const cleanupMod = loadModule("src/server/database/OperationalCleanup.ts", {
    "@/server/database/Postgres": pgMod,
    "@/server/security/RateLimitService": rateLimitMod,
    "@/server/ai/QuotaService": quotaMod,
  }, sharedGlobals);

  return {
    postgresPool: pgMod.postgresPool as () => { end: () => Promise<void>; query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount: number }> },
    CloudDatabase: cloudDbMod.CloudDatabase as Record<string, (...args: unknown[]) => Promise<unknown>>,
    AuthService: authMod.AuthService as Record<string, (...args: unknown[]) => Promise<unknown>>,
    SyncService: syncMod.SyncService as Record<string, (...args: unknown[]) => Promise<unknown>>,
    CollaborationDatabase: collabDbMod.CollaborationDatabase as Record<string, (...args: unknown[]) => Promise<unknown>>,
    OperationalCleanup: cleanupMod.OperationalCleanup as {
      run: (opts?: { rateLimitMaxAgeMs?: number; quotaMinuteRetainDays?: number; batchLimit?: number }) => Promise<{
        executed: boolean;
        rateLimitsRemoved: number;
        quotaMinuteBucketsRemoved: number;
        skippedReason?: string;
        batchLimit?: number;
      }>;
    },
    hashToken: cryptoMod.hashToken as (value: string) => string,
  };
}

test.describe("Lote 2B/2C — Lógica e contrato do endpoint de manutenção", () => {
  test("POST /api/internal/maintenance/cleanup falha fechado sem MAINTENANCE_SECRET e valida autenticação/rate-limit", async () => {
    const validSecret = "m".repeat(40);
    const env: Record<string, string | undefined> = { NODE_ENV: "production" };
    let rateAllowed = true;
    let cleanupResponse: Record<string, unknown> = {
      executed: true,
      rateLimitsRemoved: 3,
      quotaMinuteBucketsRemoved: 5,
      batchLimit: 10_000,
    };

    const nextServerMock = {
      NextResponse: class MockNextResponse extends Response {
        static json(data: unknown, init?: ResponseInit) {
          const headers = new Headers(init?.headers);
          headers.set("content-type", "application/json");
          return new Response(JSON.stringify(data), { ...init, headers });
        }
      },
    };
    const cryptoCore = loadModule("src/server/security/crypto-core.ts");
    const cryptoMod = loadModule("src/server/security/Crypto.ts", { "./crypto-core": cryptoCore });
    const route = loadModule(
      "src/app/api/internal/maintenance/cleanup/route.ts",
      {
        "next/server": nextServerMock,
        "@/server/auth/http": {
          jsonBody: async (req: Request) => JSON.parse(await req.text()),
        },
        "@/server/database/OperationalCleanup": {
          OperationalCleanup: {
            run: async () => cleanupResponse,
          },
        },
        "@/server/security/Crypto": {
          constantTimeEqual: cryptoMod.constantTimeEqual,
        },
        "@/server/security/RateLimit": {
          requestAddress: () => "203.0.113.10",
          rateLimitStrict: async () => ({
            allowed: rateAllowed,
            remaining: rateAllowed ? 9 : 0,
            limit: 10,
            resetAt: new Date(Date.now() + 60_000).toISOString(),
            retryAfter: 60,
          }),
        },
      },
      { process: { env } },
    ) as { POST: (req: Request) => Promise<Response> };

    // 1) Sem segredo configurado -> 503 (nunca público)
    const unconfigured = await route.POST(new Request("https://studyai.invalid/api/internal/maintenance/cleanup", { method: "POST" }));
    expect(unconfigured.status).toBe(503);
    expect(unconfigured.headers.get("cache-control")).toBe("no-store");

    // 2) Segredo curto (< 32 chars) -> 503
    env.MAINTENANCE_SECRET = "curto-demais";
    const weakSecret = await route.POST(new Request("https://studyai.invalid/api/internal/maintenance/cleanup", { method: "POST" }));
    expect(weakSecret.status).toBe(503);

    // 3) Segredo válido configurado, mas sem header -> 401
    env.MAINTENANCE_SECRET = validSecret;
    const missingAuth = await route.POST(new Request("https://studyai.invalid/api/internal/maintenance/cleanup", { method: "POST" }));
    expect(missingAuth.status).toBe(401);

    // 4) Segredo errado -> 401
    const wrongAuth = await route.POST(
      new Request("https://studyai.invalid/api/internal/maintenance/cleanup", {
        method: "POST",
        headers: { "x-maintenance-secret": "x".repeat(40) },
      }),
    );
    expect(wrongAuth.status).toBe(401);

    // 5) Segredo válido via x-maintenance-secret -> 200
    const okDirect = await route.POST(
      new Request("https://studyai.invalid/api/internal/maintenance/cleanup", {
        method: "POST",
        headers: { "x-maintenance-secret": validSecret },
      }),
    );
    expect(okDirect.status).toBe(200);
    expect(okDirect.headers.get("cache-control")).toBe("no-store");
    expect(await okDirect.json()).toMatchObject({
      ok: true,
      executed: true,
      rateLimitsRemoved: 3,
      quotaMinuteBucketsRemoved: 5,
    });

    // 6) Segredo válido via Authorization: Bearer + advisory lock ocupado -> 202
    cleanupResponse = {
      executed: false,
      rateLimitsRemoved: 0,
      quotaMinuteBucketsRemoved: 0,
      skippedReason: "already_running",
    };
    const busy = await route.POST(
      new Request("https://studyai.invalid/api/internal/maintenance/cleanup", {
        method: "POST",
        headers: { authorization: `Bearer ${validSecret}` },
      }),
    );
    expect(busy.status).toBe(202);
    expect(await busy.json()).toMatchObject({ ok: true, executed: false, skippedReason: "already_running" });

    // 7) Rate limit excedido -> 429
    rateAllowed = false;
    const limited = await route.POST(
      new Request("https://studyai.invalid/api/internal/maintenance/cleanup", {
        method: "POST",
        headers: { "x-maintenance-secret": validSecret },
      }),
    );
    expect(limited.status).toBe(429);
  });

  test("restoreBackupAtomic rejeita backup com payload corrompido ou fora de esquema antes de gravar", async () => {
    const pgMock = { hasPostgres: () => false, query: async () => ({ rows: [], rowCount: 0 }), transaction: async () => { throw new Error("unused"); } };
    const conflictMod = loadModule("src/server/cloud/ConflictResolver.ts");
    const typesMod = loadModule("src/server/cloud/types.ts");
    const cloudMod = loadModule("src/server/cloud/CloudDatabase.ts", {
      "@/server/database/Postgres": pgMock,
      "@/server/storage/ObjectStorage": { ObjectStorage: { mode: () => "database" } },
      "./ConflictResolver": conflictMod,
      "./types": typesMod,
    }) as {
      CloudDatabase: {
        restoreBackupAtomic: (userId: string, backupId: string, deviceId: string) => Promise<unknown>;
      };
    };

    let errInvalidId: unknown;
    try {
      await cloudMod.CloudDatabase.restoreBackupAtomic("u1", "   ", "dev1");
    } catch (e) {
      errInvalidId = e;
    }
    expect(String(errInvalidId)).toContain("Identificador de backup inválido");

    let errMissing: unknown;
    try {
      await cloudMod.CloudDatabase.restoreBackupAtomic("u1", "nao-existe", "dev1");
    } catch (e) {
      errMissing = e;
    }
    expect(String(errMissing)).toContain("Backup não encontrado");
  });
});

test.describe("Lote 2B/2C — PostgreSQL real (atomicidade, concorrência e manutenção)", () => {
  const databaseUrl = process.env.DATABASE_URL;
  test.skip(
    !isDisposableLocalPostgres(databaseUrl),
    "Requer PostgreSQL local descartável (DATABASE_URL loopback + STUDYAI_ALLOW_LOCAL_DB_TESTS=1).",
  );

  test("PG-1: migrations 0002 e schema.sql são idempotentes e criam os 5 índices user_id válidos", async () => {
    const pg = testRequire("pg") as typeof import("pg");
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 2, ssl: false });
    try {
      const schemaSql = readFileSync(path.join(process.cwd(), "src/server/database/schema.sql"), "utf8");
      const mig0002 = readFileSync(path.join(process.cwd(), "migrations/0002_lote2_atomicity_and_indexes.sql"), "utf8");

      // Idempotência: aplicar duas vezes cada
      await pool.query(schemaSql);
      await pool.query(schemaSql);
      await pool.query(mig0002);
      await pool.query(mig0002);

      const expectedIndexes = [
        "refresh_tokens_user_id",
        "refresh_tokens_user_family",
        "backups_user_created",
        "shares_user_created",
        "account_tokens_user_id",
      ];
      const idxResult = await pool.query<{ indexname: string; indisvalid: boolean }>(
        `SELECT i.relname AS indexname, ix.indisvalid
         FROM pg_index ix
         JOIN pg_class i ON i.oid = ix.indexrelid
         JOIN pg_namespace n ON n.oid = i.relnamespace
         WHERE n.nspname = 'public' AND i.relname = ANY($1::text[])
         ORDER BY i.relname`,
        [expectedIndexes],
      );
      expect(idxResult.rows.map((r) => r.indexname).sort()).toEqual([...expectedIndexes].sort());
      expect(idxResult.rows.every((r) => r.indisvalid)).toBe(true);

      const colResult = await pool.query<{ column_name: string }>(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'refresh_tokens'
           AND column_name IN ('family_id', 'replaced_by', 'rotated_at')
         ORDER BY column_name`,
      );
      expect(colResult.rows.map((r) => r.column_name)).toEqual(["family_id", "replaced_by", "rotated_at"]);
    } finally {
      await pool.end();
    }
  });

  test("PG-2: rotação atômica de refresh token entre 2 instâncias + tolerância a abas concorrentes + revogação de família em reuso", async () => {
    const instA = createServerRuntime(databaseUrl!);
    const instB = createServerRuntime(databaseUrl!);
    const pg = testRequire("pg") as typeof import("pg");
    const adminPool = new pg.Pool({ connectionString: databaseUrl, max: 2, ssl: false });
    const email = `lote2-refresh-${Date.now()}@example.test`;
    let userId = "";

    try {
      const schemaSql = readFileSync(path.join(process.cwd(), "src/server/database/schema.sql"), "utf8");
      await adminPool.query(schemaSql);

      const reg = (await instA.AuthService.register({
        name: "Teste Refresh",
        email,
        password: "StudyAI2026secure",
        deviceId: "dev-a",
        deviceName: "Notebook A",
      })) as { sessionId: string; refreshToken: string; accessToken: string };
      const claims = (instA.AuthService.access as unknown as (t: string) => { sub: string })(reg.accessToken);
      userId = claims.sub;

      // Segundo dispositivo independente (Device B) NÃO pode ser desconectado por reuso na família A
      const loginB = (await instB.AuthService.login({
        email,
        password: "StudyAI2026secure",
        deviceId: "dev-b",
        deviceName: "Celular B",
      })) as { sessionId: string; refreshToken: string };

      // 1) Corrida simultânea entre duas instâncias/pools com o mesmo refresh token
      const raceResults = await Promise.allSettled([
        instA.AuthService.refresh(reg.refreshToken),
        instB.AuthService.refresh(reg.refreshToken),
        instA.AuthService.refresh(reg.refreshToken),
        instB.AuthService.refresh(reg.refreshToken),
      ]);
      const winners = raceResults.filter((r): r is PromiseFulfilledResult<{ sessionId: string; refreshToken: string }> => r.status === "fulfilled");
      const losers = raceResults.filter((r) => r.status === "rejected");
      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(3);

      const winnerSession = winners[0].value;
      // Dentro da janela de tolerância (10s), a corrida legítima NÃO derruba a sessão vencedora!
      expect(await instB.AuthService.isSessionActive(userId, winnerSession.sessionId)).toBe(true);
      expect(await instA.AuthService.isSessionActive(userId, reg.sessionId)).toBe(false);

      // 2) Simular passagem da janela de tolerância (30s atrás) e reuso do token antigo rotacionado
      await adminPool.query(
        "UPDATE refresh_tokens SET rotated_at = NOW() - INTERVAL '30 seconds' WHERE id = $1",
        [reg.sessionId],
      );
      let reuseFailed = false;
      try {
        await instB.AuthService.refresh(reg.refreshToken);
      } catch {
        reuseFailed = true;
      }
      expect(reuseFailed).toBe(true);

      // A família comprometida (incluindo o token vencedor) foi revogada...
      expect(await instA.AuthService.isSessionActive(userId, winnerSession.sessionId)).toBe(false);
      // ...mas o segundo dispositivo (Device B) continua intacto e ativo!
      expect(await instB.AuthService.isSessionActive(userId, loginB.sessionId)).toBe(true);

      // 3) Compatibilidade com sessão legada (family_id IS NULL) + replay após logout explícito
      const legacySessionId = `legacy-${Date.now()}`;
      const legacyToken = `legacy-refresh-token-${Date.now()}-abcdef123456`;
      await adminPool.query(
        `INSERT INTO refresh_tokens (id, user_id, token_hash, device_id, device_name, expires_at, family_id)
         VALUES ($1, $2, $3, 'dev-legacy', 'Legacy Browser', NOW() + INTERVAL '7 days', NULL)`,
        [legacySessionId, userId, instA.hashToken(legacyToken)],
      );
      const rotatedLegacy = (await instA.AuthService.refresh(legacyToken)) as { sessionId: string; refreshToken: string };
      expect(await instB.AuthService.isSessionActive(userId, rotatedLegacy.sessionId)).toBe(true);

      // Logout explícito no dispositivo B seguido de tentativa de replay do token revogado
      await instB.AuthService.logout(loginB.refreshToken);
      let replayAfterLogout = false;
      try {
        await instA.AuthService.refresh(loginB.refreshToken);
      } catch {
        replayAfterLogout = true;
      }
      expect(replayAfterLogout).toBe(true);
    } finally {
      if (userId) await adminPool.query("DELETE FROM users WHERE id = $1", [userId]).catch(() => undefined);
      await instA.postgresPool().end().catch(() => undefined);
      await instB.postgresPool().end().catch(() => undefined);
      await adminPool.end().catch(() => undefined);
    }
  });

  test("PG-3: Cloud Sync impede sobrescrita silenciosa sob escrita concorrente (update e insert inicial) em 2 pools", async () => {
    const instA = createServerRuntime(databaseUrl!);
    const instB = createServerRuntime(databaseUrl!);
    const pg = testRequire("pg") as typeof import("pg");
    const adminPool = new pg.Pool({ connectionString: databaseUrl, max: 2, ssl: false });
    const userA = `lote2_sync_a_${Date.now()}`;
    const userB = `lote2_sync_b_${Date.now()}`;

    try {
      await adminPool.query("INSERT INTO users (id, email, password_hash) VALUES ($1, $2, 'h'), ($3, $4, 'h')", [
        userA, `${userA}@example.test`, userB, `${userB}@example.test`,
      ]);

      // 1) Criação inicial concorrente (baseVersion=0) do mesmo recordId por 2 instâncias
      const firstRace = await Promise.all([
        instA.SyncService.push(userA, [{
          entity: "notes",
          recordId: "race-create-1",
          operation: "upsert",
          baseVersion: 0,
          updatedAt: new Date().toISOString(),
          hash: "hash-a1",
          data: { title: "Criado por A" },
          deviceId: "dev-a",
        }]),
        instB.SyncService.push(userA, [{
          entity: "notes",
          recordId: "race-create-1",
          operation: "upsert",
          baseVersion: 0,
          updatedAt: new Date().toISOString(),
          hash: "hash-b1",
          data: { title: "Criado por B" },
          deviceId: "dev-b",
        }]),
      ]) as Array<{ accepted: Array<{ version: number; hash: string }>; conflicts: Array<{ remote: { version: number; hash: string } }> }>;

      const createAccepted = firstRace.flatMap((r) => r.accepted);
      const createConflicts = firstRace.flatMap((r) => r.conflicts);
      expect(createAccepted).toHaveLength(1);
      expect(createConflicts).toHaveLength(1);
      expect(createAccepted[0].version).toBe(1);
      expect(createConflicts[0].remote.hash).toBe(createAccepted[0].hash);

      // 2) Atualização concorrente (baseVersion=1) por 2 instâncias
      const updateRace = await Promise.all([
        instA.SyncService.push(userA, [{
          entity: "notes",
          recordId: "race-create-1",
          operation: "upsert",
          baseVersion: 1,
          updatedAt: new Date().toISOString(),
          hash: "hash-a2",
          data: { title: "Editado por A" },
          deviceId: "dev-a",
        }]),
        instB.SyncService.push(userA, [{
          entity: "notes",
          recordId: "race-create-1",
          operation: "upsert",
          baseVersion: 1,
          updatedAt: new Date().toISOString(),
          hash: "hash-b2",
          data: { title: "Editado por B" },
          deviceId: "dev-b",
        }]),
      ]) as Array<{ accepted: Array<{ version: number; hash: string }>; conflicts: Array<{ remote: { version: number; hash: string } }> }>;

      const updateAccepted = updateRace.flatMap((r) => r.accepted);
      const updateConflicts = updateRace.flatMap((r) => r.conflicts);
      expect(updateAccepted).toHaveLength(1);
      expect(updateConflicts).toHaveLength(1);
      expect(updateAccepted[0].version).toBe(2);
      expect(updateConflicts[0].remote.version).toBe(2);
      expect(updateConflicts[0].remote.hash).toBe(updateAccepted[0].hash);

      // 3) Isolamento entre usuários com mesmo recordId
      const userBPush = (await instB.SyncService.push(userB, [{
        entity: "notes",
        recordId: "race-create-1",
        operation: "upsert",
        baseVersion: 0,
        updatedAt: new Date().toISOString(),
        hash: "hash-user-b",
        data: { title: "Nota privada de B" },
        deviceId: "dev-b",
      }])) as { accepted: Array<{ version: number; hash: string }>; conflicts: unknown[] };
      expect(userBPush.accepted).toHaveLength(1);
      expect(userBPush.conflicts).toHaveLength(0);

      const storedA = await adminPool.query<{ version: string; hash: string }>(
        "SELECT version, hash FROM sync_records WHERE user_id = $1 AND record_id = 'race-create-1'",
        [userA],
      );
      expect(Number(storedA.rows[0].version)).toBe(2);
      expect(storedA.rows[0].hash).toBe(updateAccepted[0].hash);
    } finally {
      await adminPool.query("DELETE FROM users WHERE id IN ($1, $2)", [userA, userB]).catch(() => undefined);
      await instA.postgresPool().end().catch(() => undefined);
      await instB.postgresPool().end().catch(() => undefined);
      await adminPool.end().catch(() => undefined);
    }
  });

  test("PG-4: Colaboração impede sobrescrita silenciosa em saveResource() com 2 pools concorrentes", async () => {
    const instA = createServerRuntime(databaseUrl!);
    const instB = createServerRuntime(databaseUrl!);
    const pg = testRequire("pg") as typeof import("pg");
    const adminPool = new pg.Pool({ connectionString: databaseUrl, max: 2, ssl: false });
    const userA = `lote2_collab_a_${Date.now()}`;
    const userB = `lote2_collab_b_${Date.now()}`;

    try {
      await adminPool.query("INSERT INTO users (id, email, password_hash) VALUES ($1, $2, 'h'), ($3, $4, 'h')", [
        userA, `${userA}@example.test`, userB, `${userB}@example.test`,
      ]);
      await adminPool.query("INSERT INTO user_profiles (user_id, name) VALUES ($1, 'Alice'), ($2, 'Bruno')", [userA, userB]);

      const room = (await instA.CollaborationDatabase.createRoom(userA, "Sala Concorrência", "", "study")) as { id: string };
      await adminPool.query("INSERT INTO room_members (room_id, user_id, role) VALUES ($1, $2, 'editor')", [room.id, userB]);

      const created = (await instA.CollaborationDatabase.saveResource({
        roomId: room.id,
        type: "note",
        title: "Nota v1",
        data: { body: "Inicial" },
        createdBy: userA,
        updatedBy: userA,
      })) as { id: string; version: number };
      expect(created.version).toBe(1);

      const race = await Promise.allSettled([
        instA.CollaborationDatabase.saveResource({
          id: created.id,
          roomId: room.id,
          type: "note",
          title: "Nota editada por A",
          data: { body: "Conteudo A" },
          createdBy: userA,
          updatedBy: userA,
          expectedVersion: 1,
        }),
        instB.CollaborationDatabase.saveResource({
          id: created.id,
          roomId: room.id,
          type: "note",
          title: "Nota editada por B",
          data: { body: "Conteudo B" },
          createdBy: userB,
          updatedBy: userB,
          expectedVersion: 1,
        }),
      ]);

      const ok = race.filter((r): r is PromiseFulfilledResult<{ version: number; title: string }> => r.status === "fulfilled");
      const fail = race.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      expect(ok).toHaveLength(1);
      expect(fail).toHaveLength(1);
      expect(ok[0].value.version).toBe(2);
      expect(String(fail[0].reason)).toContain("VERSION_CONFLICT");

      const revCount = await adminPool.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM collaboration_revisions WHERE resource_id = $1",
        [created.id],
      );
      expect(Number(revCount.rows[0].count)).toBe(1);
    } finally {
      await adminPool.query("DELETE FROM users WHERE id IN ($1, $2)", [userA, userB]).catch(() => undefined);
      await instA.postgresPool().end().catch(() => undefined);
      await instB.postgresPool().end().catch(() => undefined);
      await adminPool.end().catch(() => undefined);
    }
  });

  test("PG-5: SyncService.restore() executa em transação única e faz rollback completo em falha intermediária", async () => {
    const inst = createServerRuntime(databaseUrl!);
    const pg = testRequire("pg") as typeof import("pg");
    const adminPool = new pg.Pool({ connectionString: databaseUrl, max: 2, ssl: false });
    const userA = `lote2_restore_a_${Date.now()}`;
    const userB = `lote2_restore_b_${Date.now()}`;
    const triggerFn = `fail_restore_midway_${Date.now()}`;

    try {
      await adminPool.query("INSERT INTO users (id, email, password_hash) VALUES ($1, $2, 'h'), ($3, $4, 'h')", [
        userA, `${userA}@example.test`, userB, `${userB}@example.test`,
      ]);

      // Estado inicial (2 notas) -> criar backup
      await inst.SyncService.push(userA, [
        { entity: "notes", recordId: "n1", operation: "upsert", baseVersion: 0, updatedAt: new Date().toISOString(), hash: "h-n1-v1", data: { text: "N1 original" }, deviceId: "dev-1" },
        { entity: "notes", recordId: "n2", operation: "upsert", baseVersion: 0, updatedAt: new Date().toISOString(), hash: "h-n2-v1", data: { text: "N2 original" }, deviceId: "dev-1" },
      ]);
      const backup = (await inst.CloudDatabase.createBackup(userA)) as { id: string };

      // Alterar estado após o backup: atualizar n1 e adicionar n3 (extra que o restore deve apagar)
      await inst.SyncService.push(userA, [
        { entity: "notes", recordId: "n1", operation: "upsert", baseVersion: 1, updatedAt: new Date().toISOString(), hash: "h-n1-v2", data: { text: "N1 alterado" }, deviceId: "dev-1" },
        { entity: "notes", recordId: "n3", operation: "upsert", baseVersion: 0, updatedAt: new Date().toISOString(), hash: "h-n3-v1", data: { text: "N3 extra" }, deviceId: "dev-1" },
      ]);

      const beforeSync = await adminPool.query(
        "SELECT record_id, version, hash, deleted_at IS NOT NULL AS deleted FROM sync_records WHERE user_id = $1 ORDER BY record_id",
        [userA],
      );
      const beforeLogsCount = Number((await adminPool.query<{ c: string }>("SELECT COUNT(*)::text AS c FROM sync_logs WHERE user_id = $1", [userA])).rows[0].c);

      // Injetar falha real no PostgreSQL na 2ª linha inserida em sync_logs durante o restore
      await adminPool.query(`
        CREATE OR REPLACE FUNCTION ${triggerFn}() RETURNS trigger AS $$
        BEGIN
          IF NEW.user_id = '${userA}' AND NEW.record_id = 'n1' THEN
            RAISE EXCEPTION 'INJECTED_MID_RESTORE_FAILURE';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER ${triggerFn}_trg BEFORE INSERT ON sync_logs
        FOR EACH ROW EXECUTE FUNCTION ${triggerFn}();
      `);

      let failedErr: unknown;
      try {
        await inst.SyncService.restore(userA, backup.id, "dev-restore");
      } catch (e) {
        failedErr = e;
      }
      expect(String(failedErr)).toContain("INJECTED_MID_RESTORE_FAILURE");

      // Remover trigger temporário
      await adminPool.query(`DROP TRIGGER IF EXISTS ${triggerFn}_trg ON sync_logs; DROP FUNCTION IF EXISTS ${triggerFn}();`);

      // Confirmar ZERO gravação parcial (n3 NÃO foi deletado, n1/n2 intocados, sync_logs inalterado)
      const afterFailedSync = await adminPool.query(
        "SELECT record_id, version, hash, deleted_at IS NOT NULL AS deleted FROM sync_records WHERE user_id = $1 ORDER BY record_id",
        [userA],
      );
      const afterFailedLogsCount = Number((await adminPool.query<{ c: string }>("SELECT COUNT(*)::text AS c FROM sync_logs WHERE user_id = $1", [userA])).rows[0].c);
      expect(afterFailedSync.rows).toEqual(beforeSync.rows);
      expect(afterFailedLogsCount).toBe(beforeLogsCount);

      // Usuário B não pode restaurar backup do Usuário A
      let crossUserErr: unknown;
      try {
        await inst.SyncService.restore(userB, backup.id, "dev-b");
      } catch (e) {
        crossUserErr = e;
      }
      expect(String(crossUserErr)).toContain("Backup não encontrado");

      // Restore sem falha deve concluir integralmente
      const restored = (await inst.SyncService.restore(userA, backup.id, "dev-restore")) as Array<{ recordId: string; operation: string }>;
      expect(restored).toHaveLength(3);
      const finalRows = await adminPool.query<{ record_id: string; hash: string; deleted: boolean }>(
        "SELECT record_id, hash, deleted_at IS NOT NULL AS deleted FROM sync_records WHERE user_id = $1 ORDER BY record_id",
        [userA],
      );
      expect(finalRows.rows).toEqual([
        { record_id: "n1", hash: "h-n1-v1", deleted: false },
        { record_id: "n2", hash: "h-n2-v1", deleted: false },
        { record_id: "n3", hash: "deleted:h-n3-v1", deleted: true },
      ]);
    } finally {
      await adminPool.query(`DROP TRIGGER IF EXISTS ${triggerFn}_trg ON sync_logs; DROP FUNCTION IF EXISTS ${triggerFn}();`).catch(() => undefined);
      await adminPool.query("DELETE FROM users WHERE id IN ($1, $2)", [userA, userB]).catch(() => undefined);
      await inst.postgresPool().end().catch(() => undefined);
      await adminPool.end().catch(() => undefined);
    }
  });

  test("PG-6: OperationalCleanup usa advisory lock multi-instância, respeita piso 2h/batch e script CLI executa limpo", async () => {
    const inst = createServerRuntime(databaseUrl!);
    const pg = testRequire("pg") as typeof import("pg");
    const lockPool = new pg.Pool({ connectionString: databaseUrl, max: 2, ssl: false });
    const prefix = `lote2_cleanup_${Date.now()}`;
    const userId = `${prefix}_user`;

    try {
      await lockPool.query("INSERT INTO users (id, email, password_hash) VALUES ($1, $2, 'h')", [userId, `${userId}@example.test`]);
      await lockPool.query(
        `INSERT INTO rate_limits (key, window_bucket, count, created_at) VALUES
          ($1, 1, 5, NOW() - INTERVAL '30 minutes'),
          ($2, 1, 8, NOW() - INTERVAL '4 hours')`,
        [`${prefix}:active`, `${prefix}:expired`],
      );
      await lockPool.query(
        `INSERT INTO usage_quotas (user_id, date, minute_bucket, requests_count, tokens_count) VALUES
          ($1, CURRENT_DATE - INTERVAL '10 days', 0, 50, 0),
          ($1, CURRENT_DATE - INTERVAL '10 days', 12345, 2, 0)`,
        [userId],
      );

      // 1) Segurar o advisory lock em outra conexão simula outra instância executando limpeza concorrente
      const locker = await lockPool.connect();
      try {
        await locker.query("BEGIN");
        const gotLock = await locker.query<{ locked: boolean }>("SELECT pg_try_advisory_xact_lock(71029481, 2026) AS locked");
        expect(gotLock.rows[0].locked).toBe(true);

        const skipped = await inst.OperationalCleanup.run({ rateLimitMaxAgeMs: 60_000, quotaMinuteRetainDays: 1, batchLimit: 100 });
        expect(skipped.executed).toBe(false);
        expect(skipped.skippedReason).toBe("already_running");
        await locker.query("COMMIT");
      } finally {
        locker.release();
      }

      // 2) Após liberar lock, limpeza remove apenas expirados e preserva janela ativa (30m) e diário (minute_bucket=0)
      const ran = await inst.OperationalCleanup.run({ rateLimitMaxAgeMs: 60_000, quotaMinuteRetainDays: 1, batchLimit: 100 });
      expect(ran.executed).toBe(true);
      expect(ran.rateLimitsRemoved).toBeGreaterThanOrEqual(1);
      expect(ran.quotaMinuteBucketsRemoved).toBeGreaterThanOrEqual(1);

      const remainingRates = await lockPool.query<{ key: string }>(
        "SELECT key FROM rate_limits WHERE key LIKE $1",
        [`${prefix}%`],
      );
      expect(remainingRates.rows.map((r) => r.key)).toEqual([`${prefix}:active`]);

      const remainingQuotas = await lockPool.query<{ minute_bucket: number }>(
        "SELECT minute_bucket FROM usage_quotas WHERE user_id = $1",
        [userId],
      );
      expect(remainingQuotas.rows.map((r) => Number(r.minute_bucket))).toEqual([0]);

      // 3) Executar script CLI operacional real contra o mesmo banco descartável (idempotente)
      const stdout = execFileSync("node", ["scripts/run-operational-cleanup.mjs"], {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: databaseUrl, DATABASE_SSL: "false" },
        encoding: "utf8",
      });
      const parsed = JSON.parse(stdout.trim()) as { event: string; executed: boolean; rateLimitsRemoved: number; quotaMinuteBucketsRemoved: number };
      expect(parsed.event).toBe("operational_cleanup");
      expect(parsed.executed).toBe(true);
    } finally {
      await lockPool.query("DELETE FROM rate_limits WHERE key LIKE $1", [`${prefix}%`]).catch(() => undefined);
      await lockPool.query("DELETE FROM users WHERE id = $1", [userId]).catch(() => undefined);
      await inst.postgresPool().end().catch(() => undefined);
      await lockPool.end().catch(() => undefined);
    }
  });
});
