import pg from "pg";

const { Pool } = pg;

const MAX_RATE_LIMIT_WINDOW_MS = 2 * 60 * 60 * 1000;
const DEFAULT_RATE_LIMIT_AGE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_QUOTA_RETAIN_DAYS = 7;
const DEFAULT_BATCH_LIMIT = 10_000;
const MAX_BATCH_LIMIT = 50_000;
const LOCK_CLASS_ID = 71029481;
const LOCK_OBJECT_ID = 2026;

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error("[OperationalCleanup] DATABASE_URL não configurada; execução abortada.");
  process.exit(1);
}

const caCert = process.env.DATABASE_CA_CERT?.trim();
const rejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false";
const ssl = process.env.DATABASE_SSL === "false"
  ? false
  : process.env.NODE_ENV === "production" || process.env.DATABASE_SSL === "true" || caCert
    ? {
        rejectUnauthorized,
        ...(caCert ? { ca: caCert } : {}),
      }
    : undefined;

const parseIntEnv = (raw, fallback, min, max) => {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
};

const safeMaxAgeMs = Math.max(
  MAX_RATE_LIMIT_WINDOW_MS,
  parseIntEnv(process.env.CLEANUP_RATE_LIMIT_MAX_AGE_MS, DEFAULT_RATE_LIMIT_AGE_MS, MAX_RATE_LIMIT_WINDOW_MS, 365 * 24 * 60 * 60 * 1000),
);
const safeRetainDays = parseIntEnv(process.env.CLEANUP_QUOTA_RETAIN_DAYS, DEFAULT_QUOTA_RETAIN_DAYS, 2, 365);
const safeBatchLimit = parseIntEnv(process.env.CLEANUP_BATCH_LIMIT, DEFAULT_BATCH_LIMIT, 100, MAX_BATCH_LIMIT);

const pool = new Pool({
  connectionString,
  max: 1,
  ssl,
  connectionTimeoutMillis: 10_000,
});

const startedAt = performance.now();
try {
  const client = await pool.connect();
  let releaseError;
  try {
    await client.query("BEGIN");
    const lock = await client.query(
      "SELECT pg_try_advisory_xact_lock($1, $2) AS locked",
      [LOCK_CLASS_ID, LOCK_OBJECT_ID],
    );
    if (!lock.rows[0]?.locked) {
      await client.query("COMMIT");
      console.log(JSON.stringify({
        event: "operational_cleanup",
        executed: false,
        skippedReason: "already_running",
        durationMs: Math.round(performance.now() - startedAt),
      }));
    } else {
      const rateLimits = await client.query(
        `DELETE FROM rate_limits
         WHERE ctid IN (
           SELECT ctid FROM rate_limits
           WHERE created_at < NOW() - ($1::bigint * INTERVAL '1 millisecond')
           LIMIT $2
         )`,
        [safeMaxAgeMs, safeBatchLimit],
      );
      const quotas = await client.query(
        `DELETE FROM usage_quotas
         WHERE ctid IN (
           SELECT ctid FROM usage_quotas
           WHERE minute_bucket > 0
             AND date < CURRENT_DATE - ($1::int * INTERVAL '1 day')
           LIMIT $2
         )`,
        [safeRetainDays, safeBatchLimit],
      );
      await client.query("COMMIT");
      console.log(JSON.stringify({
        event: "operational_cleanup",
        executed: true,
        rateLimitsRemoved: rateLimits.rowCount ?? 0,
        quotaMinuteBucketsRemoved: quotas.rowCount ?? 0,
        batchLimit: safeBatchLimit,
        durationMs: Math.round(performance.now() - startedAt),
      }));
    }
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rbErr) {
      releaseError = rbErr instanceof Error ? rbErr : new Error(String(rbErr));
    }
    throw error;
  } finally {
    client.release(releaseError);
  }
} catch (error) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "UNKNOWN";
  console.error(`[OperationalCleanup] Falha na limpeza operacional (${code}).`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
