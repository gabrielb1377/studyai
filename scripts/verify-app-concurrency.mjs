#!/usr/bin/env node
/**
 * Verificação de concorrência no nível da APLICAÇÃO (Sprint 37E.7C).
 *
 * Diferente de `verify-concurrency.mjs` (SQL puro), este script sobe o build
 * standalone em modo produção, aponta para um PostgreSQL descartável e exercita
 * as rotas reais de autenticação, quota e `/api/tutor`.
 *
 * Uso:
 *   CONFIRM_TEST_DATABASE=1 \
 *   DATABASE_URL=postgresql://postgres@127.0.0.1:55433/studyai_37e7c \
 *   STUDYAI_STANDALONE_DIR=.next/standalone \
 *     node scripts/verify-app-concurrency.mjs
 *
 * Requisitos:
 *   - `npm run build` executado e `.next/standalone/server.js` presente.
 *   - Banco descartável com o schema atual (o script aplica o schema).
 *   - Nenhuma chave de provider real no ambiente (o script remove GEMINI_API_KEY,
 *     GROQ_API_KEY, OPENROUTER_API_KEY, OLLAMA_URL e SMTP_* dos servidores).
 *
 * Cobre:
 *   5. Rate limit de login compartilhado entre DUAS instâncias reais.
 *   6. BYOK Gemini falha → fallback Groq shared, com quota compartilhada
 *      consumida ANTES das tentativas (logs do ProviderManager).
 *   7. Quota esgotada → Groq shared não é executado (nenhum log novo).
 *   E. Banco indisponível → login/cadastro/recuperação e quota fail-closed.
 *   F. Número de tentativas de provider é limitado (sem loop/retry infinito).
 *
 * Segurança:
 *   - Recusa NODE_ENV=production no processo pai.
 *   - Recusa DATABASE_URL fora de loopback.
 *   - Recusa banco cujo nome não pareça descartável/teste.
 *   - Nunca executa DROP; remove apenas usuários `conc37e7c_%`, suas quotas/
 *     chaves (CASCADE) e as chaves de rate limit `login:*` do banco de teste.
 */
import { spawn, spawnSync } from "node:child_process";
import { createCipheriv, createHmac, randomBytes, scrypt as scryptCallback } from "node:crypto";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import pg from "pg";

const scrypt = promisify(scryptCallback);
const { Pool } = pg;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

if (process.env.NODE_ENV === "production") {
  fail("Recusado: NODE_ENV=production no processo pai. Use um banco de teste isolado.");
}
if (process.env.CONFIRM_TEST_DATABASE !== "1") {
  fail("Defina CONFIRM_TEST_DATABASE=1 para confirmar que o banco é descartável.");
}

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) fail("DATABASE_URL não configurada.");

const databaseUrl = new URL(connectionString);
if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(databaseUrl.hostname)) {
  fail(`DATABASE_URL aponta para host não local (${databaseUrl.hostname}). Recusado.`);
}
const databaseName = databaseUrl.pathname.replace(/^\//, "");
if (!/(test|37e7c|disposable|scratch)/i.test(databaseName)) {
  fail(`Banco "${databaseName}" não parece descartável/teste. Recusado.`);
}

const standaloneDir = path.resolve(
  repoRoot,
  process.env.STUDYAI_STANDALONE_DIR?.trim() || ".next/standalone",
);
await stat(path.join(standaloneDir, "server.js")).catch(() => {
  fail(`Build standalone não encontrado em ${standaloneDir}. Execute "npm run build".`);
});

const authSecret = process.env.AUTH_SECRET?.trim()
  || "studyai-37e7c-test-auth-secret-0123456789abcdef";
const apiKeySecret = process.env.API_KEYS_ENCRYPTION_KEY?.trim()
  || "studyai-37e7c-test-api-key-secret-0123456789abcdef";
if (authSecret.length < 32) fail("AUTH_SECRET de teste precisa ter ao menos 32 caracteres.");

const userId = "conc37e7c_main";
const userEmail = `${userId}@example.test`;
const rateLimitKey = "login:203.0.113.37";
const today = new Date().toISOString().slice(0, 10);
const results = [];
const servers = new Set();
const pool = new Pool({ connectionString, max: 2, connectionTimeoutMillis: 8_000 });

function record(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function signTestJwt() {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    sub: userId,
    email: userEmail,
    sessionId: "conc37e7c_session",
    type: "access",
    iss: "studyai",
    aud: "studyai-web",
    iat: now,
    exp: now + 900,
  }));
  const signature = createHmac("sha256", authSecret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

async function encryptV2(plaintext) {
  const key = await scrypt(apiKeySecret, Buffer.from("studyai-api-key-encryption-v2", "utf8"), 32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v2:${iv.toString("base64url")}:${tag.toString("base64url")}:${ciphertext.toString("base64url")}`;
}

function serverEnv(port, overrides = {}) {
  const env = { ...process.env };
  for (const key of [
    "DATABASE_URL",
    "DATABASE_SSL",
    "AUTH_SECRET",
    "API_KEYS_ENCRYPTION_KEY",
    "APP_URL",
    "NODE_ENV",
    "PORT",
    "HOSTNAME",
    "GEMINI_API_KEY",
    "GROQ_API_KEY",
    "OPENROUTER_API_KEY",
    "OLLAMA_URL",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "EMAIL_FROM",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "S3_ENDPOINT",
    "S3_REGION",
    "HEALTH_SECRET",
  ]) {
    delete env[key];
  }
  return {
    ...env,
    NODE_ENV: "production",
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    DATABASE_URL: connectionString,
    DATABASE_SSL: "false",
    DATABASE_POOL_SIZE: "10",
    AUTH_SECRET: authSecret,
    API_KEYS_ENCRYPTION_KEY: apiKeySecret,
    APP_URL: `https://localhost:${port}`,
    ...overrides,
  };
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
  });
}

async function startServer({ port: requestedPort, ...overrides } = {}) {
  const port = requestedPort ?? await freePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server.js"], {
    cwd: standaloneDir,
    env: serverEnv(port, overrides),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = [];
  child.stdout.on("data", (chunk) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk) => output.push(chunk.toString()));
  const server = {
    child,
    base,
    port,
    output: () => output.join("").slice(-8_000),
    exited: false,
  };
  child.once("exit", () => { server.exited = true; });
  servers.add(server);

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server.exited) {
      throw new Error(`Servidor na porta ${port} encerrou ao iniciar.\n${server.output()}`);
    }
    try {
      const response = await fetch(`${base}/api/health/live`, {
        signal: AbortSignal.timeout(1_500),
      });
      if (response.status === 200) return server;
    } catch {
      // Ainda iniciando.
    }
    await sleep(500);
  }
  throw new Error(`Servidor na porta ${port} não respondeu a /api/health/live.\n${server.output()}`);
}

async function stopServer(server) {
  if (!server || server.exited) return;
  server.child.kill();
  await Promise.race([once(server.child, "exit"), sleep(4_000)]);
  if (!server.exited && server.child.pid) {
    spawnSync("taskkill", ["/PID", String(server.child.pid), "/T", "/F"], { stdio: "ignore" });
  }
}

async function httpJson(url, options = {}, timeoutMs = 90_000) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, body, headers: response.headers };
}

async function setQuota({ daily, minute = 0 }) {
  await pool.query("DELETE FROM usage_quotas WHERE user_id=$1", [userId]);
  await pool.query(
    `INSERT INTO usage_quotas (user_id, date, minute_bucket, requests_count, tokens_count)
     VALUES ($1,$2,0,$3,0)`,
    [userId, today, daily],
  );
  if (minute !== undefined) {
    const minuteBucket = Math.floor(Date.now() / 60_000);
    await pool.query(
      `INSERT INTO usage_quotas (user_id, date, minute_bucket, requests_count, tokens_count)
       VALUES ($1,$2,$3,$4,0)`,
      [userId, today, minuteBucket, minute],
    );
  }
}

async function readQuota() {
  const minuteBucket = Math.floor(Date.now() / 60_000);
  const result = await pool.query(
    `SELECT
       (SELECT requests_count FROM usage_quotas WHERE user_id=$1 AND date=$2 AND minute_bucket=0) AS daily,
       (SELECT COALESCE(SUM(requests_count),0) FROM usage_quotas WHERE user_id=$1 AND date=$2 AND minute_bucket=$3) AS minute`,
    [userId, today, minuteBucket],
  );
  return {
    daily: Number(result.rows[0]?.daily ?? 0),
    minute: Number(result.rows[0]?.minute ?? 0),
  };
}

async function managerLogs(server) {
  const response = await httpJson(`${server.base}/api/ai/manager`, {}, 30_000);
  if (response.status !== 200 || !Array.isArray(response.body?.logs)) {
    throw new Error(`Falha ao ler /api/ai/manager: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return response.body.logs;
}

function tutorBody(overrides = {}) {
  return JSON.stringify({
    message: "Explique a fotossíntese em uma frase.",
    history: [],
    stream: false,
    ...overrides,
  });
}

async function seed() {
  const schema = await readFile(path.join(repoRoot, "src/server/database/schema.sql"), "utf8");
  await pool.query(schema);
  await pool.query("DELETE FROM users WHERE id LIKE 'conc37e7c_%'");
  await pool.query("DELETE FROM rate_limits WHERE key=$1", [rateLimitKey]);

  await pool.query(
    "INSERT INTO users (id,email,password_hash) VALUES ($1,$2,'x')",
    [userId, userEmail],
  );
  const encrypted = await encryptV2("AIzaFAKE37E7C0123456789");
  await pool.query(
    `INSERT INTO user_api_keys (user_id,provider,encrypted_key,key_hint,created_at,updated_at)
     VALUES ($1,'gemini',$2,'AIza••••6789',NOW(),NOW())
     ON CONFLICT (user_id,provider) DO UPDATE
       SET encrypted_key=EXCLUDED.encrypted_key, key_hint=EXCLUDED.key_hint, updated_at=NOW()`,
    [userId, encrypted],
  );
}

async function cleanupDatabase() {
  await pool.query("DELETE FROM users WHERE id LIKE 'conc37e7c_%'").catch(() => {});
  await pool.query("DELETE FROM rate_limits WHERE key=$1", [rateLimitKey]).catch(() => {});
}

async function scenario5() {
  const [portA, portB] = [await freePort(), await freePort()];
  const serverA = await startServer({ port: portA });
  const serverB = await startServer({ port: portB });
  try {
    const clientAddress = "203.0.113.37";
    const invalidLogin = {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Mesmo identificador lógico para os dois clientes independentes.
        "x-forwarded-for": clientAddress,
      },
      body: JSON.stringify({
        email: "nobody-37e7c@example.test",
        password: "wrong-password-1",
        deviceId: "conc37e7c",
        deviceName: "Teste",
      }),
    };
    // Aquece o schema em cada processo e zera o contador antes da medição.
    await httpJson(`${serverA.base}/auth/login`, invalidLogin, 30_000);
    await httpJson(`${serverB.base}/auth/login`, invalidLogin, 30_000);
    await pool.query("DELETE FROM rate_limits WHERE key=$1", [rateLimitKey]);
    let allowed = 0;
    let unexpected = 0;
    for (let attempt = 0; attempt < 10; attempt++) {
      const server = attempt % 2 === 0 ? serverA : serverB;
      const response = await httpJson(`${server.base}/auth/login`, invalidLogin, 30_000);
      if (response.status === 400) allowed++;
      else if (response.status !== 429 && response.status !== 503) unexpected++;
    }
    const eleventh = await httpJson(`${serverA.base}/auth/login`, invalidLogin, 30_000);
    const twelfth = await httpJson(`${serverB.base}/auth/login`, invalidLogin, 30_000);
    const bucket = Math.floor(Date.now() / (15 * 60_000));
    const stored = await pool.query(
      "SELECT count FROM rate_limits WHERE key=$1 AND window_bucket=$2",
      [rateLimitKey, bucket],
    );
    const persisted = Number(stored.rows[0]?.count ?? 0);
    record(
      "5. rate limit de login compartilhado entre 2 instâncias reais",
      allowed === 10 && unexpected === 0 && eleventh.status === 429 && twelfth.status === 429 && persisted >= 11,
      `${allowed} permitidas; 11ª=${eleventh.status}; 12ª=${twelfth.status}; contador=${persisted}`,
    );
  } finally {
    await stopServer(serverA);
    await stopServer(serverB);
  }
}

async function scenario6And7() {
  const server = await startServer();
  try {
    // Cenário 6: BYOK Gemini (chave falsa) + Groq shared sem chave. A quota
    // compartilhada precisa ser consumida antes das tentativas de provider.
    await setQuota({ daily: 499, minute: 0 });
    const before = await managerLogs(server);
    const response = await httpJson(`${server.base}/api/tutor`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `studyai_access=${signTestJwt()}`,
      },
      body: tutorBody({ mode: "automatic", model: "gemini-2.5-flash" }),
    }, 120_000);
    const quota = await readQuota();
    const after = await managerLogs(server);
    const newLogs = after.slice(0, Math.max(0, after.length - before.length));
    const attempted = new Set(newLogs.map((log) => log.provider));
    const bounded = newLogs.length <= 4 && attempted.size === newLogs.length;

    record(
      "6. BYOK Gemini falha → Groq shared tenta após quota compartilhada",
      [502, 503].includes(response.status)
        && quota.daily === 500
        && quota.minute === 1
        && attempted.has("gemini")
        && attempted.has("groq"),
      `status=${response.status}; quota=${quota.daily}/${quota.minute}; providers=${[...attempted].join(",")}`,
    );
    record(
      "F. tentativas de provider limitadas (sem loop de retry)",
      bounded,
      `${newLogs.length} tentativa(s), providers únicos=${attempted.size}`,
    );

    // Cenário 7: quota esgotada. Groq shared não pode ser executado.
    await setQuota({ daily: 500, minute: 20 });
    const logsBeforeExhausted = await managerLogs(server);
    const exhausted = await httpJson(`${server.base}/api/tutor`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `studyai_access=${signTestJwt()}`,
      },
      body: tutorBody({ mode: "manual", provider: "groq" }),
    }, 60_000);
    const logsAfterExhausted = await managerLogs(server);
    record(
      "7. quota esgotada → Groq shared não é executado",
      exhausted.status === 429
        && exhausted.body?.code === "QUOTA_EXCEEDED"
        && logsAfterExhausted.length === logsBeforeExhausted.length,
      `status=${exhausted.status}; logs=${logsBeforeExhausted.length}→${logsAfterExhausted.length}`,
    );
  } finally {
    await stopServer(server);
  }
}

async function scenarioFInterruptedStream() {
  // Sem BYOK Gemini ou chaves compartilhadas no processo: automatic percorre
  // quota shared uma vez, usa o Ollama HTTP local e só pode tentar cada
  // provider da cadeia uma vez. Isso mede cobrança e fallback sem tráfego
  // para providers públicos.
  await pool.query("DELETE FROM user_api_keys WHERE user_id=$1", [userId]);
  await setQuota({ daily: 0, minute: 0 });

  const mockPort = await freePort();
  const mockProvider = createServer((request, response) => {
    if (request.url === "/api/version") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ version: "test-fake" }));
      return;
    }
    if (request.url === "/api/tags") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ models: [{ name: "qwen3:4b" }] }));
      return;
    }
    if (request.url === "/api/ps") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ models: [] }));
      return;
    }
    if (request.url !== "/api/chat") {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": "application/x-ndjson" });
    // Trunca deliberadamente um registro JSON no meio e reseta a conexão:
    // nenhum evento `done` válido pode ser produzido pelo provider.
    response.write('{"message":{"content":"partial');
    setTimeout(() => response.socket?.destroy(), 50);
  });
  await new Promise((resolve, reject) => {
    mockProvider.once("error", reject);
    mockProvider.listen(mockPort, "127.0.0.1", resolve);
  });

  const server = await startServer({ OLLAMA_URL: `http://127.0.0.1:${mockPort}` });
  try {
    const response = await httpJson(`${server.base}/api/tutor`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `studyai_access=${signTestJwt()}`,
      },
      body: tutorBody({ mode: "automatic", stream: true }),
    }, 30_000);
    const events = typeof response.body === "string"
      ? response.body.split("\n").filter(Boolean).map((line) => {
        try { return JSON.parse(line); } catch { return null; }
      }).filter(Boolean)
      : response.body && typeof response.body === "object"
        ? [response.body]
        : [];
    const logs = await managerLogs(server);
    const quota = await readQuota();
    const hasError = events.some((event) => event.type === "error");
    const hasDone = events.some((event) => event.type === "done");
    const providers = new Set(logs.map((log) => log.provider));
    record(
      "F2. stream truncado → quota uma vez, erro explícito e fallback finito",
      response.status === 200
        && hasError
        && !hasDone
        && quota.daily === 1
        && quota.minute === 1
        && logs.length === 4
        && providers.size === logs.length
        && providers.has("ollama"),
      `status=${response.status}; evento=${events.map((event) => event.type).join(",")}; quota=${quota.daily}/${quota.minute}; providers=${[...providers].join(",")}`,
    );
  } finally {
    await stopServer(server);
    await new Promise((resolve) => mockProvider.close(resolve));
  }
}

async function scenarioE() {
  const badDatabase = "postgresql://postgres@127.0.0.1:1/studyai_37e7c_unavailable";
  const server = await startServer({
    DATABASE_URL: badDatabase,
    APP_URL: "https://localhost:3443",
  });
  try {
    const live = await httpJson(`${server.base}/api/health/live`, {}, 10_000);
    const ready = await httpJson(`${server.base}/api/health`, {}, 30_000);
    record(
      "E1. liveness 200 com banco indisponível; readiness 503",
      live.status === 200 && ready.status === 503 && ready.body?.checks?.database?.available === false,
      `live=${live.status}; ready=${ready.status}`,
    );

    const login = await httpJson(`${server.base}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "nobody-37e7c@example.test",
        password: "wrong-password-1",
        deviceId: "conc37e7c",
        deviceName: "Teste",
      }),
    }, 30_000);
    const register = await httpJson(`${server.base}/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Teste",
        email: "new-37e7c@example.test",
        password: "password1234",
        deviceId: "conc37e7c",
        deviceName: "Teste",
      }),
    }, 30_000);
    const recover = await httpJson(`${server.base}/auth/recover`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "nobody-37e7c@example.test" }),
    }, 30_000);
    record(
      "E2. login, cadastro e recuperação fail-closed com banco indisponível",
      login.status === 503 && register.status === 503 && recover.status === 503,
      `login=${login.status}; register=${register.status}; recover=${recover.status}`,
    );

    const tutor = await httpJson(`${server.base}/api/tutor`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `studyai_access=${signTestJwt()}`,
      },
      body: tutorBody({ mode: "manual", provider: "groq" }),
    }, 30_000);
    const logs = await managerLogs(server);
    record(
      "E3. quota fail-closed: banco indisponível nega antes de qualquer provider",
      tutor.status >= 500 && tutor.status !== 429 && logs.length === 0,
      `status=${tutor.status}; logs=${logs.length}`,
    );
  } finally {
    await stopServer(server);
  }
}

async function main() {
  await seed();
  if (process.argv.includes("--f2-only")) {
    await scenarioFInterruptedStream();
  } else {
    await scenario5();
    await scenario6And7();
    await scenarioFInterruptedStream();
    await scenarioE();
  }

  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} verificações de aplicação passaram`);
  if (failed.length > 0) process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  console.error(`✖ Harness abortado: ${error instanceof Error ? error.message : "erro desconhecido"}`);
  process.exitCode = 1;
} finally {
  for (const server of servers) {
    await stopServer(server);
  }
  await cleanupDatabase();
  await pool.end().catch(() => {});
}
