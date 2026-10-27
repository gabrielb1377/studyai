#!/usr/bin/env node
/**
 * Harness de concorrência para um PostgreSQL de TESTE com múltiplas conexões.
 *
 * O ambiente Windows usado na Sprint 37E.7B não conseguiu criar backends
 * PostgreSQL (`0xC0000142`), então este script é a forma reproduzível de
 * validar concorrência real em CI/containers. Ele NÃO deve ser apontado para
 * produção.
 *
 * Uso:
 *   CONFIRM_TEST_DATABASE=1 DATABASE_URL=postgres://... \
 *     node scripts/verify-concurrency.mjs [--migrate]
 *
 * `--migrate` aplica `src/server/database/schema.sql` antes dos testes.
 * Sem `--migrate`, assume que o schema já existe.
 *
 * Cobre:
 *   A. Quota atômica: restante = 1, duas tentativas simultâneas → exatamente
 *      uma autorizada (contadores 500 e 501, sem duplicidade).
 *   B. 50 incrementos simultâneos em 2 pools → contador exato.
 *   C. Rate limit compartilhado (limite 20, 30 tentativas, 2 pools) → 20.
 *   D. Quota diária (limite 500, 520 tentativas, 2 pools) → 500 autorizadas.
 *   E. Quota de minuto (limite 20, 30 tentativas) → 20 autorizadas.
 *   F. Persistência entre "instâncias" (pool A grava, pool B lê).
 *   G. Fail-closed do driver: conexão em porta fechada lança erro.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;

if (process.env.NODE_ENV === "production") {
  console.error("✖ Recusado: NODE_ENV=production. Use um banco de teste isolado.");
  process.exit(1);
}
if (process.env.CONFIRM_TEST_DATABASE !== "1") {
  console.error("✖ Defina CONFIRM_TEST_DATABASE=1 para confirmar que o banco é de teste.");
  process.exit(1);
}
const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error("✖ DATABASE_URL não configurada.");
  process.exit(1);
}
let databaseUrl;
try {
  databaseUrl = new URL(connectionString);
} catch {
  console.error("✖ DATABASE_URL inválida.");
  process.exit(1);
}
if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(databaseUrl.hostname)) {
  console.error("✖ Recusado: o harness aceita somente PostgreSQL em loopback.");
  process.exit(1);
}
const databaseName = databaseUrl.pathname.replace(/^\//, "");
if (!/(test|37e7c|disposable|scratch)/i.test(databaseName)) {
  console.error("✖ Recusado: o nome do banco não identifica um banco de teste/descartável.");
  process.exit(1);
}

const migrate = process.argv.includes("--migrate");
const ssl = process.env.DATABASE_SSL === "false" ? false : undefined;
const poolA = new Pool({ connectionString, max: 8, ssl, connectionTimeoutMillis: 8_000 });
const poolB = new Pool({ connectionString, max: 8, ssl, connectionTimeoutMillis: 8_000 });

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}
const bucket = Math.floor(Date.now() / 60_000);
const today = new Date().toISOString().slice(0, 10);

async function migrateSchema() {
  const schema = await readFile(path.join(process.cwd(), "src/server/database/schema.sql"), "utf8");
  const client = await poolA.connect();
  try {
    await client.query("BEGIN");
    await client.query(schema);
    await client.query("COMMIT");
    console.log("schema aplicado (idempotente)");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function cleanup() {
  await poolA.query("DELETE FROM rate_limits WHERE key LIKE 'verify:%'").catch(() => {});
  await poolA.query("DELETE FROM users WHERE id LIKE 'verify_%'").catch(() => {});
}

async function main() {
  if (migrate) await migrateSchema();
  await cleanup();

  // A. Quota atômica: restante = 1. Duas conexões independentes disputam a
  // última unidade. O incremento atômico deve autorizar exatamente uma.
  await poolA.query("DELETE FROM users WHERE id='verify_atomic_user'");
  await poolA.query(
    "INSERT INTO users (id,email,password_hash) VALUES ('verify_atomic_user','verify_atomic@example.test','x')"
  );
  await poolA.query(
    `INSERT INTO usage_quotas (user_id, date, minute_bucket, requests_count, tokens_count)
     VALUES ('verify_atomic_user', $1, 0, 499, 0)`,
    [today]
  );
  const atomic = await Promise.all([
    poolA.query(
      `INSERT INTO usage_quotas (user_id, date, minute_bucket, requests_count, tokens_count)
       VALUES ('verify_atomic_user', $1, 0, 1, 0)
       ON CONFLICT (user_id, date, minute_bucket)
       DO UPDATE SET requests_count = usage_quotas.requests_count + 1
       RETURNING requests_count`,
      [today]
    ).then((r) => Number(r.rows[0].requests_count)),
    poolB.query(
      `INSERT INTO usage_quotas (user_id, date, minute_bucket, requests_count, tokens_count)
       VALUES ('verify_atomic_user', $1, 0, 1, 0)
       ON CONFLICT (user_id, date, minute_bucket)
       DO UPDATE SET requests_count = usage_quotas.requests_count + 1
       RETURNING requests_count`,
      [today]
    ).then((r) => Number(r.rows[0].requests_count)),
  ]);
  const atomicAllowed = atomic.filter((n) => n <= 500).length;
  const atomicCounts = [...atomic].sort((a, b) => a - b).join(",");
  record(
    "A. quota atômica: restante=1, 2 concorrentes → 1 autorizada",
    atomicAllowed === 1 && atomicCounts === "500,501",
    `${atomicAllowed} autorizada(s); contadores ${atomicCounts}`
  );

  // 1. Incrementos simultâneos em duas instâncias.
  const key = "verify:counter";
  await Promise.all(Array.from({ length: 50 }, (_, i) =>
    (i % 2 === 0 ? poolA : poolB)
      .query(
        `INSERT INTO rate_limits (key, window_bucket, count) VALUES ($1, $2, 1)
         ON CONFLICT (key, window_bucket) DO UPDATE SET count = rate_limits.count + 1
         RETURNING count`,
        [key, bucket]
      )
      .then((r) => Number(r.rows[0].count))
  ));
  const counter = await poolB.query("SELECT count FROM rate_limits WHERE key=$1 AND window_bucket=$2", [key, bucket]);
  record("B. 50 incrementos simultâneos (2 pools) = 50", Number(counter.rows[0]?.count) === 50, String(counter.rows[0]?.count));

  // 2. Rate limit compartilhado entre instâncias.
  const limitKey = "verify:ratelimit";
  let allowed = 0;
  await Promise.all(Array.from({ length: 30 }, (_, i) =>
    (i % 2 === 0 ? poolA : poolB)
      .query(
        `INSERT INTO rate_limits (key, window_bucket, count) VALUES ($1, $2, 1)
         ON CONFLICT (key, window_bucket) DO UPDATE SET count = rate_limits.count + 1
         RETURNING count`,
        [limitKey, bucket]
      )
      .then((r) => { if (Number(r.rows[0].count) <= 20) allowed++; })
  ));
  record("C. rate limit 20 compartilhado entre 2 pools", allowed === 20, `${allowed} autorizados`);

  // 3. Quota diária: 520 tentativas concorrentes, limite 500.
  await poolA.query("DELETE FROM users WHERE id='verify_quota_user'");
  await poolA.query(
    "INSERT INTO users (id,email,password_hash) VALUES ('verify_quota_user','verify_quota@example.test','x')"
  );
  const daily = await Promise.all(Array.from({ length: 520 }, (_, i) =>
    (i % 2 === 0 ? poolA : poolB)
      .query(
        `INSERT INTO usage_quotas (user_id, date, minute_bucket, requests_count, tokens_count)
         VALUES ($1, $2, 0, 1, 0)
         ON CONFLICT (user_id, date, minute_bucket)
         DO UPDATE SET requests_count = usage_quotas.requests_count + 1
         RETURNING requests_count`,
        ["verify_quota_user", today]
      )
      .then((r) => Number(r.rows[0].requests_count))
  ));
  const dailyAllowed = daily.filter((n) => n <= 500).length;
  record("D. quota diária 500 de 520 concorrentes", dailyAllowed === 500, `${dailyAllowed} autorizadas`);

  // 4. Quota de minuto: 30 tentativas concorrentes, limite 20.
  const minute = await Promise.all(Array.from({ length: 30 }, (_, i) =>
    (i % 2 === 0 ? poolA : poolB)
      .query(
        `INSERT INTO usage_quotas (user_id, date, minute_bucket, requests_count, tokens_count)
         VALUES ($1, $2, $3, 1, 0)
         ON CONFLICT (user_id, date, minute_bucket)
         DO UPDATE SET requests_count = usage_quotas.requests_count + 1
         RETURNING requests_count`,
        ["verify_quota_user", today, bucket]
      )
      .then((r) => Number(r.rows[0].requests_count))
  ));
  const minuteAllowed = minute.filter((n) => n <= 20).length;
  record("E. quota de minuto 20 de 30 concorrentes", minuteAllowed === 20, `${minuteAllowed} autorizadas`);

  // 5. Persistência entre instâncias.
  await poolA.query(
    `INSERT INTO rate_limits (key, window_bucket, count) VALUES ('verify:shared', $1, 7)
     ON CONFLICT (key, window_bucket) DO UPDATE SET count = 7`,
    [bucket]
  );
  const readBack = await poolB.query("SELECT count FROM rate_limits WHERE key='verify:shared' AND window_bucket=$1", [bucket]);
  record("F. pool B lê o contador gravado pelo pool A", Number(readBack.rows[0]?.count) === 7, String(readBack.rows[0]?.count));

  // 6. Driver falha em porta fechada (base para fail-closed da aplicação).
  const bad = new Pool({ connectionString: `postgresql://x:x@127.0.0.1:1/nope`, max: 1, connectionTimeoutMillis: 1500 });
  let driverFailed = false;
  try {
    await bad.query("SELECT 1");
  } catch {
    driverFailed = true;
  } finally {
    await bad.end().catch(() => {});
  }
  record("G. conexão indisponível lança erro (fail-closed)", driverFailed);

  await cleanup();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} verificações passaram`);
  process.exitCode = failed.length === 0 ? 0 : 1;
}

try {
  await main();
} catch (error) {
  console.error(`✖ Harness abortado: ${error instanceof Error ? error.message : "erro desconhecido"}`);
  process.exitCode = 1;
} finally {
  await poolA.end().catch(() => {});
  await poolB.end().catch(() => {});
}
