import { expect, test } from "@playwright/test";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { createRequire } from "node:module";

const testRequire = createRequire(__filename);
const PASSWORD = "StudyAI2026secure";
const NEW_PASSWORD = "StudyAI2027reset";
const STANDALONE_SERVER = path.join(process.cwd(), ".next", "standalone", "server.js");

function canRunLocalHomologation(): boolean {
  const url = process.env.DATABASE_URL?.trim();
  if (!url || process.env.STUDYAI_ALLOW_LOCAL_DB_TESTS !== "1") return false;
  if (process.env.STUDYAI_RUN_LOCAL_HOMOLOGATION !== "1") return false;
  try {
    const parsed = new URL(url);
    return (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") && existsSync(STANDALONE_SERVER);
  } catch {
    return false;
  }
}

type CapturedEmail = {
  from: string;
  to: string[];
  raw: string;
};

async function startLocalSmtpServer() {
  const messages: CapturedEmail[] = [];
  const server = net.createServer((socket) => {
    socket.write("220 studyai-local-smtp ESMTP\r\n");
    let buffer = "";
    let inData = false;
    let current: CapturedEmail = { from: "", to: [], raw: "" };

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      while (true) {
        if (inData) {
          const endIdx = buffer.indexOf("\r\n.\r\n");
          if (endIdx === -1) break;
          current.raw = buffer.slice(0, endIdx);
          buffer = buffer.slice(endIdx + 5);
          inData = false;
          messages.push({ ...current, to: [...current.to] });
          current = { from: "", to: [], raw: "" };
          socket.write("250 2.0.0 OK queued\r\n");
          continue;
        }
        const nlIdx = buffer.indexOf("\r\n");
        if (nlIdx === -1) break;
        const line = buffer.slice(0, nlIdx);
        buffer = buffer.slice(nlIdx + 2);
        const upper = line.toUpperCase();
        if (upper.startsWith("EHLO") || upper.startsWith("HELO")) {
          socket.write("250-studyai-local-smtp\r\n250 SIZE 10485760\r\n");
        } else if (upper.startsWith("MAIL FROM:")) {
          current.from = line.slice(10).trim();
          socket.write("250 2.1.0 OK\r\n");
        } else if (upper.startsWith("RCPT TO:")) {
          current.to.push(line.slice(8).trim());
          socket.write("250 2.1.5 OK\r\n");
        } else if (upper === "DATA") {
          inData = true;
          socket.write("354 End data with <CR><LF>.<CR><LF>\r\n");
        } else if (upper === "RSET") {
          current = { from: "", to: [], raw: "" };
          socket.write("250 OK\r\n");
        } else if (upper === "QUIT") {
          socket.write("221 2.0.0 Bye\r\n");
          socket.end();
        } else {
          socket.write("250 OK\r\n");
        }
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as net.AddressInfo;
  return {
    port: address.port,
    messages,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function startLocalS3Server(expectedBucket: string) {
  const objects = new Map<string, { body: Buffer; contentType: string; sse?: string; cacheControl?: string }>();
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const pathname = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const slash = pathname.indexOf("/");
    const bucket = slash === -1 ? pathname : pathname.slice(0, slash);
    const key = slash === -1 ? "" : pathname.slice(slash + 1);

    if (bucket !== expectedBucket) {
      res.writeHead(404, { "content-type": "application/xml" });
      res.end("<Error><Code>NoSuchBucket</Code></Error>");
      return;
    }

    if (req.method === "HEAD" && !key) {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.method === "PUT" && key) {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(Buffer.from(c)));
      req.on("end", () => {
        const body = Buffer.concat(chunks);
        const etag = `"${createHash("md5").update(body).digest("hex")}"`;
        objects.set(key, {
          body,
          contentType: String(req.headers["content-type"] ?? "application/octet-stream"),
          sse: typeof req.headers["x-amz-server-side-encryption"] === "string" ? req.headers["x-amz-server-side-encryption"] : undefined,
          cacheControl: typeof req.headers["cache-control"] === "string" ? req.headers["cache-control"] : undefined,
        });
        res.writeHead(200, { ETag: etag });
        res.end();
      });
      return;
    }

    if (req.method === "GET" && key) {
      const item = objects.get(key);
      if (!item) {
        res.writeHead(404, { "content-type": "application/xml" });
        res.end("<Error><Code>NoSuchKey</Code></Error>");
        return;
      }
      res.writeHead(200, {
        "content-type": item.contentType,
        "content-length": String(item.body.byteLength),
      });
      res.end(item.body);
      return;
    }

    if (req.method === "DELETE" && key) {
      objects.delete(key);
      res.writeHead(204);
      res.end();
      return;
    }

    res.writeHead(405);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as net.AddressInfo;
  return {
    port: address.port,
    endpoint: `http://127.0.0.1:${address.port}`,
    objects,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function parseCookies(setCookies: string[]) {
  const map: Record<string, string> = {};
  for (const raw of setCookies) {
    const pair = raw.split(";")[0]?.trim() ?? "";
    const eq = pair.indexOf("=");
    if (eq > 0) map[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return map;
}

function extractTokenFromEmail(raw: string, param: "verify" | "reset"): string {
  const normalized = raw.replace(/=\r?\n/g, "").replace(/=3D/gi, "=");
  const match = normalized.match(new RegExp(`[?&]${param}=([A-Za-z0-9._~%-]+)`));
  if (!match?.[1]) throw new Error(`Token ${param} não encontrado no e-mail capturado:\n${raw}`);
  return decodeURIComponent(match[1]);
}

async function waitForServer(url: string, timeoutMs = 25_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // still booting
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Servidor standalone não respondeu em ${url} dentro de ${timeoutMs}ms.`);
}

test.describe("Lote 5 — Homologação Local Completa (Custo Zero: Standalone + PG 18.4 + S3 local + SMTP local)", () => {
  test.skip(
    !canRunLocalHomologation(),
    "Habilite STUDYAI_RUN_LOCAL_HOMOLOGATION=1, STUDYAI_ALLOW_LOCAL_DB_TESTS=1, DATABASE_URL local e `npm run build` standalone.",
  );

  test("H5-1: servidor Next.js standalone em NODE_ENV=production valida health, SMTP verify/resend/reset, gate de IA, S3+cotas, sync+backup/restore, cleanup, proxy e pg_dump/restore", async () => {
    const pg = testRequire("pg") as typeof import("pg");
    const smtp = await startLocalSmtpServer();
    const s3 = await startLocalS3Server("studyai-homolog");
    const standalonePort = 3299;
    const baseUrl = `http://127.0.0.1:${standalonePort}`;
    const healthSecret = "homolog-health-secret-2026";
    const maintenanceSecret = "homolog-maintenance-secret-2026-secure";
    const encryptionKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    let child: ChildProcess | undefined;
    const serverLogs: string[] = [];

    try {
      child = spawn(process.execPath, [STANDALONE_SERVER], {
        cwd: path.join(process.cwd(), ".next", "standalone"),
        env: {
          ...process.env,
          NODE_ENV: "production",
          HOSTNAME: "127.0.0.1",
          PORT: String(standalonePort),
          APP_URL: "https://homolog.studyai.local",
          AUTH_SECRET: "homolog-auth-secret-minimum-32-bytes-secure",
          API_KEYS_ENCRYPTION_KEY: encryptionKey,
          HEALTH_SECRET: healthSecret,
          MAINTENANCE_SECRET: maintenanceSecret,
          TRUST_PROXY_HEADERS: "true",
          TRUSTED_PROXY_HOPS: "1",
          DATABASE_URL: process.env.DATABASE_URL!,
          DATABASE_SSL: "false",
          S3_ENDPOINT: s3.endpoint,
          S3_BUCKET: "studyai-homolog",
          S3_REGION: "us-east-1",
          S3_ACCESS_KEY_ID: "local-homolog-key",
          S3_SECRET_ACCESS_KEY: "local-homolog-secret",
          S3_FORCE_PATH_STYLE: "true",
          S3_SERVER_SIDE_ENCRYPTION: "AES256",
          SMTP_HOST: "127.0.0.1",
          SMTP_PORT: String(smtp.port),
          SMTP_SECURE: "false",
          EMAIL_FROM: "StudyAI Homolog <noreply@homolog.studyai.local>",
          STORAGE_FILES_QUOTA_BYTES: "1024",
          STORAGE_BACKUPS_QUOTA_BYTES: "209715200",
          AI_USER_DAILY_TOKEN_LIMIT: "50000",
          AI_GLOBAL_DAILY_TOKEN_BUDGET: "250000",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });

      child.stdout?.on("data", (d) => serverLogs.push(d.toString("utf8")));
      child.stderr?.on("data", (d) => serverLogs.push(d.toString("utf8")));

      await waitForServer(`${baseUrl}/api/health/live`);

      // 1) Liveness e Readiness completos em NODE_ENV=production
      const liveRes = await fetch(`${baseUrl}/api/health/live`);
      expect(liveRes.status).toBe(200);

      const healthRes = await fetch(`${baseUrl}/api/health`, {
        headers: { "x-health-secret": healthSecret },
      });
      const healthJson = (await healthRes.json()) as {
        status: string;
        database: string;
        objectStorage: { available: boolean; mode: string };
        checks: {
          application: { publicUrlConfigured: boolean; clientAddressConfigured: boolean; emailConfigured: boolean };
          database: { available: boolean; schemaReady: boolean };
        };
      };
      expect(healthRes.status, JSON.stringify(healthJson)).toBe(200);
      expect(healthJson.status).toBe("ok");
      expect(healthJson.database).toBe("postgres");
      expect(healthJson.objectStorage).toMatchObject({ available: true, mode: "s3" });
      expect(healthJson.checks.application).toEqual({
        publicUrlConfigured: true,
        clientAddressConfigured: true,
        emailConfigured: true,
      });
      expect(healthJson.checks.database.available).toBe(true);
      expect(healthJson.checks.database.schemaReady).toBe(true);

      // 2) Cadastro real -> token OCULTO no JSON em produção + e-mail real via SMTP
      const email = `homolog-${Date.now()}@example.test`;
      const clientIp = "198.51.100.77";
      const regRes = await fetch(`${baseUrl}/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": `9.9.9.9, ${clientIp}` },
        body: JSON.stringify({
          name: "Estudante Homolog",
          email,
          password: PASSWORD,
          deviceId: "dev-homolog-1",
          deviceName: "Standalone Test",
        }),
      });
      expect(regRes.status).toBe(201);
      const regJson = (await regRes.json()) as { ok: boolean; verificationToken?: string; database: string };
      expect(regJson.ok).toBe(true);
      expect(regJson.verificationToken).toBeUndefined();
      expect(regJson.database).toBe("postgres");
      expect(smtp.messages.length).toBeGreaterThanOrEqual(1);
      const firstVerifyToken = extractTokenFromEmail(smtp.messages[smtp.messages.length - 1].raw, "verify");

      const cookies = parseCookies(regRes.headers.getSetCookie());
      const cookieHeader = `studyai_access=${cookies.studyai_access}; studyai_refresh=${cookies.studyai_refresh}; studyai_csrf=${cookies.studyai_csrf}`;
      const sessionRes = await fetch(`${baseUrl}/auth/session`, { headers: { cookie: cookieHeader } });
      expect(sessionRes.status).toBe(200);
      const sessionJson = (await sessionRes.json()) as { user: { id: string; emailVerified: boolean } };
      expect(sessionJson.user.emailVerified).toBe(false);
      const userId = sessionJson.user.id;

      // 3) Gate de e-mail do Lote 3B bloqueia IA compartilhada (403) antes de verificar
      const blockedAi = await fetch(`${baseUrl}/api/tutor`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: cookieHeader,
          "x-csrf-token": cookies.studyai_csrf,
          "x-forwarded-for": clientIp,
        },
        body: JSON.stringify({
          requestId: "homolog-tutor-req-1",
          history: [],
          message: "Explique integrais",
          provider: "gemini",
          mode: "manual",
        }),
      });
      expect(blockedAi.status).toBe(403);
      const blockedBody = (await blockedAi.json()) as { code?: string };
      expect(blockedBody.code).toBe("EMAIL_NOT_VERIFIED");

      // 4) Reenvio de verificação via SMTP + verificação single-use
      const resendRes = await fetch(`${baseUrl}/auth/verify/resend`, {
        method: "POST",
        headers: {
          cookie: cookieHeader,
          "x-csrf-token": cookies.studyai_csrf,
          "x-forwarded-for": clientIp,
        },
      });
      expect(resendRes.status).toBe(200);
      const resendJson = (await resendRes.json()) as { ok: boolean; verificationToken?: string };
      expect(resendJson.verificationToken).toBeUndefined();
      const secondVerifyToken = extractTokenFromEmail(smtp.messages[smtp.messages.length - 1].raw, "verify");
      expect(secondVerifyToken).not.toBe(firstVerifyToken);

      const verifyOk = await fetch(`${baseUrl}/auth/verify`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": clientIp },
        body: JSON.stringify({ token: secondVerifyToken }),
      });
      expect(verifyOk.status).toBe(200);

      // Reuso do mesmo token falha (uso único)
      const verifyReuse = await fetch(`${baseUrl}/auth/verify`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": clientIp },
        body: JSON.stringify({ token: secondVerifyToken }),
      });
      expect(verifyReuse.status).toBe(400);

      // 5) Upload/Download/Cota/Exclusão S3 reais
      const pdfBytes = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(600, 0x41)]);
      const uploadOk = await fetch(`${baseUrl}/api/files/homolog-pdf-1`, {
        method: "PUT",
        headers: {
          cookie: cookieHeader,
          "x-csrf-token": cookies.studyai_csrf,
          "x-studyai-session-user": userId,
          "content-type": "application/pdf",
          "x-file-name": "apostila.pdf",
          "x-forwarded-for": clientIp,
        },
        body: pdfBytes,
      });
      expect(uploadOk.status).toBe(200);
      expect(s3.objects.size).toBe(1);
      const storedKey = [...s3.objects.keys()][0];
      expect(storedKey).toContain(`users/${userId}/materials/homolog-pdf-1/`);
      expect(s3.objects.get(storedKey)?.sse).toBe("AES256");

      const dlOk = await fetch(`${baseUrl}/api/files/homolog-pdf-1`, {
        headers: { cookie: cookieHeader, "x-studyai-session-user": userId },
      });
      expect(dlOk.status).toBe(200);
      expect(Buffer.from(await dlOk.arrayBuffer()).byteLength).toBe(pdfBytes.byteLength);

      // Segundo arquivo (600B + 600B > cota 1024B) -> 413 STORAGE_QUOTA_EXCEEDED
      const uploadOver = await fetch(`${baseUrl}/api/files/homolog-pdf-2`, {
        method: "PUT",
        headers: {
          cookie: cookieHeader,
          "x-csrf-token": cookies.studyai_csrf,
          "x-studyai-session-user": userId,
          "content-type": "application/pdf",
          "x-file-name": "extra.pdf",
          "x-forwarded-for": clientIp,
        },
        body: pdfBytes,
      });
      expect(uploadOver.status).toBe(413);
      const overJson = (await uploadOver.json()) as { code?: string };
      expect(overJson.code).toBe("STORAGE_QUOTA_EXCEEDED");

      // Exclusão remove também do S3 local
      const delOk = await fetch(`${baseUrl}/api/files/homolog-pdf-1`, {
        method: "DELETE",
        headers: {
          cookie: cookieHeader,
          "x-csrf-token": cookies.studyai_csrf,
          "x-studyai-session-user": userId,
          "x-forwarded-for": clientIp,
        },
      });
      expect(delOk.status).toBe(200);
      expect(s3.objects.size).toBe(0);

      // 6) Sync + Backup + Mutação + Restore atômico real
      const syncHeaders = {
        "content-type": "application/json",
        cookie: cookieHeader,
        "x-csrf-token": cookies.studyai_csrf,
        "x-studyai-session-user": userId,
        "x-forwarded-for": clientIp,
      };
      const push1 = await fetch(`${baseUrl}/sync`, {
        method: "POST",
        headers: syncHeaders,
        body: JSON.stringify({
          mutations: [
            {
              entity: "notes",
              recordId: "homolog-note-1",
              operation: "upsert",
              baseVersion: 0,
              hash: "h-v1",
              updatedAt: new Date().toISOString(),
              deviceId: "dev-homolog-1",
              data: { id: "homolog-note-1", title: "Original", content: "Conteudo V1" },
            },
          ],
        }),
      });
      expect(push1.status).toBe(200);

      const backupCreate = await fetch(`${baseUrl}/backup`, {
        method: "POST",
        headers: syncHeaders,
        body: JSON.stringify({ action: "create" }),
      });
      expect(backupCreate.status).toBe(201);
      const { backup } = (await backupCreate.json()) as { backup: { id: string } };
      expect(backup.id).toBeTruthy();

      // Sobrescreve para V2 e depois restaura o backup V1
      const push2 = await fetch(`${baseUrl}/sync`, {
        method: "POST",
        headers: syncHeaders,
        body: JSON.stringify({
          mutations: [
            {
              entity: "notes",
              recordId: "homolog-note-1",
              operation: "upsert",
              baseVersion: 1,
              hash: "h-v2",
              updatedAt: new Date().toISOString(),
              deviceId: "dev-homolog-1",
              data: { id: "homolog-note-1", title: "Alterado", content: "Conteudo V2" },
            },
          ],
        }),
      });
      expect(push2.status).toBe(200);

      const restoreRes = await fetch(`${baseUrl}/backup`, {
        method: "POST",
        headers: syncHeaders,
        body: JSON.stringify({ action: "restore", backupId: backup.id, deviceId: "dev-homolog-1" }),
      });
      expect(restoreRes.status).toBe(200);

      const pullAfterRestore = await fetch(`${baseUrl}/sync?since=0`, {
        headers: { cookie: cookieHeader, "x-studyai-session-user": userId },
      });
      const pullData = (await pullAfterRestore.json()) as { changes: Array<{ recordId: string; data: { content?: string } }> };
      const restoredNote = pullData.changes.find((c) => c.recordId === "homolog-note-1");
      expect(restoredNote?.data?.content).toBe("Conteudo V1");

      // 7) Recuperação de senha via SMTP + revogação imediata da sessão antiga
      const recoverRes = await fetch(`${baseUrl}/auth/recover`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": clientIp },
        body: JSON.stringify({ email }),
      });
      expect(recoverRes.status).toBe(200);
      const recoverJson = (await recoverRes.json()) as { ok: boolean; recoveryToken?: string };
      expect(recoverJson.recoveryToken).toBeUndefined();
      const recoveryToken = extractTokenFromEmail(smtp.messages[smtp.messages.length - 1].raw, "reset");

      const resetRes = await fetch(`${baseUrl}/auth/reset`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": clientIp },
        body: JSON.stringify({ token: recoveryToken, password: NEW_PASSWORD }),
      });
      expect(resetRes.status).toBe(200);

      const oldSessionAfterReset = await fetch(`${baseUrl}/auth/session`, { headers: { cookie: cookieHeader } });
      expect(oldSessionAfterReset.status).toBe(401);

      // 8) Maintenance cleanup endpoint (401 sem segredo -> 200 autenticado)
      const cleanupNoAuth = await fetch(`${baseUrl}/api/internal/maintenance/cleanup`, { method: "POST" });
      expect(cleanupNoAuth.status).toBe(401);
      const cleanupOk = await fetch(`${baseUrl}/api/internal/maintenance/cleanup`, {
        method: "POST",
        headers: { "x-maintenance-secret": maintenanceSecret, "x-forwarded-for": clientIp },
      });
      expect(cleanupOk.status).toBe(200);

      // 9) Anti-spoofing X-Forwarded-For + rate limit real (6 tentativas com IP forjado à esquerda mas mesmo hop direito -> 429)
      const spoofTargetIp = "203.0.113.99";
      const statuses: number[] = [];
      for (let i = 0; i < 6; i += 1) {
        const res = await fetch(`${baseUrl}/auth/recover`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": `10.0.0.${i + 1}, ${spoofTargetIp}`,
          },
          body: JSON.stringify({ email: `nobody-${i}@example.test` }),
        });
        statuses.push(res.status);
      }
      expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
      expect(statuses[5]).toBe(429);

      // 10) Ensaio real de backup lógico pg_dump + restore psql em novo banco (se pg_dump/psql estiverem disponíveis)
      const pgBinDir = process.env.PG_BIN_DIR || "C:\\Program Files\\PostgreSQL\\18\\bin";
      const pgDumpBin = existsSync(path.join(pgBinDir, "pg_dump.exe")) ? path.join(pgBinDir, "pg_dump.exe") : "pg_dump";
      const psqlBin = existsSync(path.join(pgBinDir, "psql.exe")) ? path.join(pgBinDir, "psql.exe") : "psql";

      const adminPool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2, ssl: false });
      const cloneDb = `studyai_h5_restore_${Date.now()}`;
      try {
        const dumpSql = execFileSync(pgDumpBin, ["--no-owner", "--no-privileges", process.env.DATABASE_URL!], {
          encoding: "utf8",
          maxBuffer: 25 * 1024 * 1024,
        });
        expect(dumpSql).toContain("CREATE TABLE public.users");
        expect(dumpSql).toContain("CREATE TABLE public.ai_global_daily_budgets");

        await adminPool.query(`CREATE DATABASE ${cloneDb}`);
        const cloneUrl = new URL(process.env.DATABASE_URL!);
        cloneUrl.pathname = `/${cloneDb}`;
        execFileSync(psqlBin, ["-v", "ON_ERROR_STOP=1", cloneUrl.toString()], {
          input: dumpSql,
          encoding: "utf8",
          maxBuffer: 25 * 1024 * 1024,
        });

        const clonePool = new pg.Pool({ connectionString: cloneUrl.toString(), max: 2, ssl: false });
        try {
          const tableCount = await clonePool.query<{ c: string }>(
            "SELECT COUNT(*)::text AS c FROM pg_tables WHERE schemaname = 'public'",
          );
          expect(Number(tableCount.rows[0].c)).toBe(35);
          const restoredUser = await clonePool.query<{ email: string }>(
            "SELECT email FROM users WHERE id = $1",
            [userId],
          );
          expect(restoredUser.rows[0]?.email).toBe(email);
        } finally {
          await clonePool.end().catch(() => undefined);
        }
      } finally {
        await adminPool.query(`DROP DATABASE IF EXISTS ${cloneDb} WITH (FORCE)`).catch(() => undefined);
        await adminPool.end().catch(() => undefined);
      }
    } finally {
      if (child && !child.killed) {
        child.kill();
      }
      await s3.close().catch(() => undefined);
      await smtp.close().catch(() => undefined);
      if (serverLogs.length > 0 && process.env.DEBUG_HOMOLOG === "1") {
        console.log(serverLogs.join(""));
      }
    }
  });
});
