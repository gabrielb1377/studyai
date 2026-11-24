import { isIP } from "node:net";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { testClientHeaders } from "./helpers/test-client-ip";

const testRequire = createRequire(__filename);
const PASSWORD = "StudyAI2026secure";
const NEW_PASSWORD = "StudyAI2027newpass";
const uniqueEmail = (label: string) =>
  `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;

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
      TextEncoder,
      TextDecoder,
      URL,
      Request,
      Response,
      Headers,
      performance,
      crypto: globalThis.crypto,
      process: globals.process ?? { env: { NODE_ENV: "test" } },
      ...globals,
    }),
    { filename: file },
  );
  return compiledModule.exports;
}

const FakeNextResponse = {
  json(data: unknown, init?: { status?: number; headers?: Record<string, string> }) {
    return new Response(JSON.stringify(data), {
      status: init?.status ?? 200,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
  },
};

function parseCookiePair(setCookieHeaders: string[], name: string): string | undefined {
  for (const raw of setCookieHeaders) {
    const firstPart = raw.split(";")[0]?.trim() ?? "";
    if (firstPart.startsWith(`${name}=`)) {
      return firstPart.slice(name.length + 1);
    }
  }
  return undefined;
}

function cookieValuesFromResponse(headersArray: Array<{ name: string; value: string }>) {
  const setCookies = headersArray
    .filter((header) => header.name.toLowerCase() === "set-cookie")
    .map((header) => header.value);
  return {
    access: parseCookiePair(setCookies, "studyai_access") ?? "",
    refresh: parseCookiePair(setCookies, "studyai_refresh") ?? "",
    csrf: parseCookiePair(setCookies, "studyai_csrf") ?? "",
  };
}

async function createUserSession(
  request: APIRequestContext,
  email: string,
  deviceId = `device-${crypto.randomUUID()}`,
  deviceName = "Chromium Test",
) {
  const registerRes = await request.post("/auth/register", {
    headers: testClientHeaders(`rh2a:${email}`),
    data: { name: "Pessoa Teste", email, password: PASSWORD, deviceId, deviceName },
  });
  expect(registerRes.status()).toBe(201);
  const cookies = cookieValuesFromResponse(registerRes.headersArray());
  const regJson = (await registerRes.json()) as { verificationToken?: string };
  const sessionRes = await request.get("/auth/session", {
    headers: { cookie: `studyai_access=${cookies.access}` },
  });
  expect(sessionRes.status()).toBe(200);
  const session = (await sessionRes.json()) as {
    user: { id: string };
    sessionId: string;
    devices: Array<{ id: string; deviceId: string; deviceName: string }>;
  };
  return {
    userId: session.user.id,
    sessionId: session.sessionId,
    deviceId,
    cookies,
    verificationToken: regJson.verificationToken ?? "",
  };
}

function makePdfBuffer(sizeBytes = 128) {
  const header = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
  if (sizeBytes <= header.byteLength) return header;
  const out = Buffer.alloc(sizeBytes, 0x20);
  header.copy(out, 0);
  return out;
}

function makePngBuffer() {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
}

function makeZipBuffer() {
  return Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00]);
}

test.describe("RH-2A — R-02 Revogação imediata de sessões", () => {
  test("rejeita com 401 token antigo após logout, refresh, revogação remota, alteração e reset de senha", async ({
    playwright,
    baseURL,
  }) => {
    const req = await playwright.request.newContext({ baseURL });
    try {
      const email = uniqueEmail("r02-revoke");
      const devA = await createUserSession(req, email, "device-A-uuid", "Notebook A");
      const oldAccessA = devA.cookies.access;

      // Sessão ativa inicialmente responde 200
      const okRes = await req.get("/auth/session", {
        headers: { cookie: `studyai_access=${oldAccessA}` },
      });
      expect(okRes.status()).toBe(200);

      // Refresh normal revoga sessão antiga e emite nova válida
      const refreshRes = await req.post("/auth/refresh", {
        headers: {
          cookie: `studyai_access=${oldAccessA}; studyai_refresh=${devA.cookies.refresh}; studyai_csrf=${devA.cookies.csrf}`,
          "x-csrf-token": devA.cookies.csrf,
        },
      });
      expect(refreshRes.status()).toBe(200);
      const refreshedCookies = cookieValuesFromResponse(refreshRes.headersArray());
      expect(refreshedCookies.access).toBeTruthy();

      const afterRefreshOld = await req.get("/auth/session", {
        headers: { cookie: `studyai_access=${oldAccessA}` },
      });
      expect(afterRefreshOld.status()).toBe(401);

      const afterRefreshNew = await req.get("/auth/session", {
        headers: { cookie: `studyai_access=${refreshedCookies.access}` },
      });
      expect(afterRefreshNew.status()).toBe(200);

      // Login de um segundo dispositivo (Device B)
      const loginB = await req.post("/auth/login", {
        data: { email, password: PASSWORD, deviceId: "device-B-uuid", deviceName: "Celular B" },
      });
      expect(loginB.status()).toBe(200);
      const cookiesB = cookieValuesFromResponse(loginB.headersArray());
      const sessionBInfo = await (
        await req.get("/auth/session", { headers: { cookie: `studyai_access=${cookiesB.access}` } })
      ).json() as { sessionId: string };

      // Device A revoga remotamente Device B
      const revokeBRes = await req.delete(`/auth/sessions/${encodeURIComponent(sessionBInfo.sessionId)}`, {
        headers: {
          cookie: `studyai_access=${refreshedCookies.access}; studyai_csrf=${refreshedCookies.csrf}`,
          "x-csrf-token": refreshedCookies.csrf,
        },
      });
      expect(revokeBRes.status()).toBe(200);

      // Token antigo do Device B é rejeitado imediatamente em APIs protegidas
      const checkReq = await playwright.request.newContext({ baseURL });
      try {
        for (const protectedPath of ["/auth/session", "/profile", `/api/files/nonexistent`]) {
          const resB = await checkReq.get(protectedPath, {
            headers: {
              cookie: `studyai_access=${cookiesB.access}`,
              "x-studyai-session-user": devA.userId,
            },
          });
          expect(resB.status(), `esperava 401 em ${protectedPath} para token revogado`).toBe(401);
        }
      } finally {
        await checkReq.dispose();
      }

      // Alteração de senha revoga sessão antiga e cria nova com deviceId correto (não sessionId)
      const changePassRes = await req.post("/auth/change-password", {
        headers: {
          cookie: `studyai_access=${refreshedCookies.access}; studyai_csrf=${refreshedCookies.csrf}`,
          "x-csrf-token": refreshedCookies.csrf,
        },
        data: { currentPassword: PASSWORD, password: NEW_PASSWORD },
      });
      expect(changePassRes.status()).toBe(200);
      const afterChangeCookies = cookieValuesFromResponse(changePassRes.headersArray());

      const oldAfterChange = await req.get("/profile", {
        headers: { cookie: `studyai_access=${refreshedCookies.access}` },
      });
      expect(oldAfterChange.status()).toBe(401);

      const newSessionAfterChangeRes = await req.get("/auth/session", {
        headers: { cookie: `studyai_access=${afterChangeCookies.access}` },
      });
      expect(newSessionAfterChangeRes.status()).toBe(200);
      const newSessionData = (await newSessionAfterChangeRes.json()) as {
        sessionId: string;
        devices: Array<{ id: string; deviceId: string }>;
      };
      const currentDevice = newSessionData.devices.find((d) => d.id === newSessionData.sessionId);
      expect(currentDevice).toBeTruthy();
      expect(currentDevice?.deviceId).toBe("device-A-uuid");
      expect(currentDevice?.deviceId).not.toBe(newSessionData.sessionId);

      // Logout revoga sessão atual e rejeita token antigo reutilizado
      const logoutRes = await req.post("/auth/logout", {
        headers: {
          cookie: `studyai_access=${afterChangeCookies.access}; studyai_refresh=${afterChangeCookies.refresh}; studyai_csrf=${afterChangeCookies.csrf}`,
          "x-csrf-token": afterChangeCookies.csrf,
        },
      });
      expect(logoutRes.status()).toBe(200);

      const reusedAfterLogout = await req.get("/auth/session", {
        headers: { cookie: `studyai_access=${afterChangeCookies.access}` },
      });
      expect(reusedAfterLogout.status()).toBe(401);

      // Reset de senha invalida sessões ativas existentes
      const loginBeforeReset = await req.post("/auth/login", {
        data: { email, password: NEW_PASSWORD, deviceId: "device-C-uuid", deviceName: "Tablet C" },
      });
      expect(loginBeforeReset.status()).toBe(200);
      const cookiesC = cookieValuesFromResponse(loginBeforeReset.headersArray());

      const recoverRes = await req.post("/auth/recover", { data: { email } });
      expect(recoverRes.status()).toBe(200);
      const recoverBody = (await recoverRes.json()) as { recoveryToken?: string };
      expect(recoverBody.recoveryToken).toBeTruthy();

      const resetRes = await req.post("/auth/reset", {
        data: { token: recoverBody.recoveryToken, password: PASSWORD },
      });
      expect(resetRes.status()).toBe(200);

      const oldAfterReset = await req.get("/auth/session", {
        headers: { cookie: `studyai_access=${cookiesC.access}` },
      });
      expect(oldAfterReset.status()).toBe(401);
    } finally {
      await req.dispose();
    }
  });

  test("rejeita JWT expirado, sessão inexistente e falha fechado com PostgreSQL indisponível sem consultas repetidas por requisição", async () => {
    const env = { NODE_ENV: "production", AUTH_SECRET: "s".repeat(32) };
    const cryptoMod = loadModule("src/server/security/Crypto.ts", { "server-only": {}, "./crypto-core": {} }, { process: { env } }) as {
      signJwt: (payload: Record<string, unknown>, exp: number) => string;
    };

    let sqlCalls = 0;
    let activeRows: Array<{ id: string }> = [{ id: "sess-1" }];
    let dbShouldFail = false;

    const fakePg = {
      hasPostgres: () => true,
      query: async () => {
        sqlCalls += 1;
        if (dbShouldFail) throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
        return { rows: activeRows };
      },
    };
    const authServiceMod = loadModule(
      "src/server/auth/AuthService.ts",
      {
        "server-only": {},
        "@/server/cloud/CloudDatabase": {},
        "@/server/database/Postgres": fakePg,
        "@/server/security/Crypto": cryptoMod,
      },
      { process: { env } },
    ) as {
      AuthService: {
        access: (token?: string) => Record<string, unknown> | null;
        isSessionActive: (u: string, s: string) => Promise<boolean>;
      };
    };
    const httpMod = loadModule(
      "src/server/auth/http.ts",
      {
        "server-only": {},
        "next/server": { NextResponse: FakeNextResponse },
        "./AuthService": authServiceMod,
        "@/server/security/Crypto": cryptoMod,
      },
      { process: { env } },
    ) as {
      requireUser: (req: Request) => { sub: string; sessionId: string };
      requireActiveSession: (req: Request, claims?: { sub: string; sessionId: string }) => Promise<unknown>;
    };

    const validJwt = cryptoMod.signJwt({ sub: "user-1", email: "a@b.com", sessionId: "sess-1", type: "access" }, 900);
    const expiredJwt = cryptoMod.signJwt({ sub: "user-1", email: "a@b.com", sessionId: "sess-1", type: "access" }, -10);
    const noSessionJwt = cryptoMod.signJwt({ sub: "user-1", email: "a@b.com", type: "access" }, 900);

    // Expirado -> 401
    expect(() =>
      httpMod.requireUser(new Request("http://local/api/x", { headers: { cookie: `studyai_access=${expiredJwt}` } })),
    ).toThrow();

    // Sessão ausente no JWT -> 401
    const noSessReq = new Request("http://local/api/x", { headers: { cookie: `studyai_access=${noSessionJwt}` } });
    const noSessClaims = httpMod.requireUser(noSessReq);
    const noSessErr = await httpMod.requireActiveSession(noSessReq, noSessClaims).catch((e: unknown) => e);
    expect((noSessErr as Response).status).toBe(401);

    // Mesma requisição chama requireActiveSession 2x -> apenas 1 query SQL
    const req1 = new Request("http://local/api/x", { headers: { cookie: `studyai_access=${validJwt}` } });
    const claims1 = httpMod.requireUser(req1);
    await httpMod.requireActiveSession(req1, claims1);
    await httpMod.requireActiveSession(req1, claims1);
    expect(sqlCalls).toBe(1);

    // Sessão revogada / inexistente no PostgreSQL -> 401
    activeRows = [];
    const req2 = new Request("http://local/api/x", { headers: { cookie: `studyai_access=${validJwt}` } });
    const errRevoked = await httpMod.requireActiveSession(req2, httpMod.requireUser(req2)).catch((e: unknown) => e);
    expect((errRevoked as Response).status).toBe(401);

    // Falha de PostgreSQL -> fail closed 503
    dbShouldFail = true;
    const req3 = new Request("http://local/api/x", { headers: { cookie: `studyai_access=${validJwt}` } });
    const errDb = await httpMod.requireActiveSession(req3, httpMod.requireUser(req3)).catch((e: unknown) => e);
    expect((errDb as Response).status).toBe(503);
  });
});

test.describe("RH-2A — R-03 Upload e download seguros", () => {
  test("bloqueia HTML/SVG/MIME incompatível/extensão enganosa/%ZZ e protege headers de download e ownership", async ({
    playwright,
    baseURL,
  }) => {
    const req = await playwright.request.newContext({ baseURL });
    try {
      const userA = await createUserSession(req, uniqueEmail("r03-a"));
      const userB = await createUserSession(req, uniqueEmail("r03-b"));
      const authHeadersA = {
        cookie: `studyai_access=${userA.cookies.access}; studyai_csrf=${userA.cookies.csrf}`,
        "x-csrf-token": userA.cookies.csrf,
        "x-studyai-session-user": userA.userId,
      };
      const authHeadersB = {
        cookie: `studyai_access=${userB.cookies.access}; studyai_csrf=${userB.cookies.csrf}`,
        "x-csrf-token": userB.cookies.csrf,
        "x-studyai-session-user": userB.userId,
      };

      // 1. x-file-name=%ZZ -> 400 (nunca 500)
      const malformedRes = await req.put("/api/files/bad-name", {
        headers: { ...authHeadersA, "content-type": "text/plain", "x-file-name": "%ZZ" },
        data: Buffer.from("texto"),
      });
      expect(malformedRes.status()).toBe(400);

      // 2. HTML malicioso e SVG com script bloqueados no PUT
      const htmlRes = await req.put("/api/files/xss-html", {
        headers: { ...authHeadersA, "content-type": "text/html", "x-file-name": "pagina.html" },
        data: Buffer.from("<html><script>alert(1)</script></html>"),
      });
      expect(htmlRes.status()).toBe(400);

      const svgRes = await req.put("/api/files/xss-svg", {
        headers: { ...authHeadersA, "content-type": "image/svg+xml", "x-file-name": "vetor.svg" },
        data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
      });
      expect(svgRes.status()).toBe(400);

      // 3. Extensão enganosa (.html como text/plain) e MIME incompatível (texto como image/png / .pdf falso)
      const disguisedHtml = await req.put("/api/files/disguised-html", {
        headers: { ...authHeadersA, "content-type": "text/plain", "x-file-name": "nota.html" },
        data: Buffer.from("texto aparentemente inocente"),
      });
      expect(disguisedHtml.status()).toBe(400);

      const mismatchedMime = await req.put("/api/files/fake-png", {
        headers: { ...authHeadersA, "content-type": "image/png", "x-file-name": "foto.png" },
        data: Buffer.from("nao sou png"),
      });
      expect(mismatchedMime.status()).toBe(400);

      const fakePdfPayload = await req.put("/api/files/fake-pdf", {
        headers: { ...authHeadersA, "content-type": "application/pdf", "x-file-name": "doc.pdf" },
        data: Buffer.from("<!doctype html><script>alert(1)</script>"),
      });
      expect(fakePdfPayload.status()).toBe(400);

      // 4. Upload válido PDF grande (>4MB) e nomes com caracteres especiais
      const largePdf = makePdfBuffer(5 * 1024 * 1024);
      const validPdfUpload = await req.put("/api/files/valid-pdf-1", {
        headers: {
          ...authHeadersA,
          "content-type": "application/pdf",
          "x-file-name": encodeURIComponent('../pasta/relatório final "2026"; aula 1.pdf'),
        },
        data: largePdf,
      });
      expect(validPdfUpload.status()).toBe(200);

      // Download autorizado preserva inline seguro + nosniff + nome sanitizado
      const pdfGet = await req.get("/api/files/valid-pdf-1", { headers: authHeadersA });
      expect(pdfGet.status()).toBe(200);
      expect(pdfGet.headers()["x-content-type-options"]).toBe("nosniff");
      expect(pdfGet.headers()["content-type"]).toBe("application/pdf");
      expect(pdfGet.headers()["content-disposition"]).toContain("inline;");
      expect(pdfGet.headers()["content-disposition"]).not.toContain("..");
      expect((await pdfGet.body()).byteLength).toBe(largePdf.byteLength);

      // 5. Upload PNG válido
      const pngUpload = await req.put("/api/files/valid-png-1", {
        headers: { ...authHeadersA, "content-type": "image/png", "x-file-name": "diagrama.png" },
        data: makePngBuffer(),
      });
      expect(pngUpload.status()).toBe(200);
      const pngGet = await req.get("/api/files/valid-png-1", { headers: authHeadersA });
      expect(pngGet.status()).toBe(200);
      expect(pngGet.headers()["content-disposition"]).toContain("inline;");
      expect(pngGet.headers()["x-content-type-options"]).toBe("nosniff");

      // 6. Formato permitido mas não-inline (DOCX) recebe attachment + nosniff
      const docxUpload = await req.put("/api/files/valid-docx-1", {
        headers: {
          ...authHeadersA,
          "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "x-file-name": "resumo.docx",
        },
        data: makeZipBuffer(),
      });
      expect(docxUpload.status()).toBe(200);
      const docxGet = await req.get("/api/files/valid-docx-1", { headers: authHeadersA });
      expect(docxGet.status()).toBe(200);
      expect(docxGet.headers()["content-disposition"]).toContain("attachment;");
      expect(docxGet.headers()["x-content-type-options"]).toBe("nosniff");

      // 7. Sem autenticação -> 401; outro usuário -> 404; inexistente -> 404
      const anonReq = await playwright.request.newContext({ baseURL });
      try {
        expect((await anonReq.get("/api/files/valid-pdf-1")).status()).toBe(401);
      } finally {
        await anonReq.dispose();
      }
      expect((await req.get("/api/files/valid-pdf-1", { headers: authHeadersB })).status()).toBe(404);
      expect((await req.get("/api/files/missing-id", { headers: authHeadersA })).status()).toBe(404);
    } finally {
      await req.dispose();
    }
  });

  test("força attachment e octet-stream para conteúdo ativo legado no GET", () => {
    const fileSec = loadModule("src/server/storage/FileSecurity.ts", { "server-only": {} }) as {
      buildDownloadHeaders: (input: {
        name: string;
        mimeType: string;
        sizeBytes: number;
        hash: string;
        content: Buffer;
      }) => Record<string, string>;
    };
    const svgContent = Buffer.from('<svg onload="alert(1)"></svg>');
    const headers = fileSec.buildDownloadHeaders({
      name: "legado.svg",
      mimeType: "image/svg+xml",
      sizeBytes: svgContent.byteLength,
      hash: "h",
      content: svgContent,
    });
    expect(headers["content-type"]).toBe("application/octet-stream");
    expect(headers["content-disposition"]).toContain("attachment;");
    expect(headers["x-content-type-options"]).toBe("nosniff");
  });
});

test.describe("RH-2A — R-04 Rate limiting consistente e deviceId", () => {
  test("requestAddress ignora cabeçalhos de IP controláveis sem política de proxy confiável", () => {
    const warnings: unknown[][] = [];
    const rlNoProxy = loadModule(
      "src/server/security/RateLimit.ts",
      { "server-only": {}, "node:net": { isIP }, "./RateLimitService": { RateLimitService: {} } },
      { process: { env: { NODE_ENV: "production" } }, console: { error: (...args: unknown[]) => warnings.push(args) } },
    ) as { requestAddress: (r: Request) => string };

    const spoofed = new Request("https://studyai.invalid/auth/reset", {
      headers: { "x-forwarded-for": "1.2.3.4", "x-real-ip": "5.6.7.8" },
    });
    expect(rlNoProxy.requestAddress(spoofed)).toBe("local");
    expect(rlNoProxy.requestAddress(spoofed)).toBe("local");
    // Alerta operacional emitido uma única vez por processo, sem dados do request.
    expect(warnings).toHaveLength(1);
    expect(String(warnings[0][0])).not.toContain("1.2.3.4");

    const rlTrustedProxy = loadModule(
      "src/server/security/RateLimit.ts",
      { "server-only": {}, "node:net": { isIP }, "./RateLimitService": { RateLimitService: {} } },
      { process: { env: { NODE_ENV: "production", TRUST_PROXY_HEADERS: "true" } } },
    ) as { requestAddress: (r: Request) => string };
    expect(rlTrustedProxy.requestAddress(spoofed)).toBe("1.2.3.4");
  });

  test("requestAddress usa a entrada de X-Forwarded-For acrescentada pelo proxy confiável, não a do cliente", () => {
    const load = (env: Record<string, string>) => loadModule(
      "src/server/security/RateLimit.ts",
      { "server-only": {}, "node:net": { isIP }, "./RateLimitService": { RateLimitService: {} } },
      { process: { env: { NODE_ENV: "production", TRUST_PROXY_HEADERS: "true", ...env } } },
    ) as { requestAddress: (r: Request) => string };
    const forwarded = (value: string) => new Request("https://studyai.invalid/auth/login", {
      headers: { "x-forwarded-for": value },
    });

    const oneHop = load({});
    // O cliente forja "1.1.1.1"; o proxy acrescenta o IP real ao final.
    expect(oneHop.requestAddress(forwarded("1.1.1.1, 203.0.113.7"))).toBe("203.0.113.7");
    expect(oneHop.requestAddress(forwarded("203.0.113.7"))).toBe("203.0.113.7");
    expect(oneHop.requestAddress(forwarded("not-an-ip"))).toBe("local");

    const twoHops = load({ TRUSTED_PROXY_HOPS: "2" });
    expect(twoHops.requestAddress(forwarded("1.1.1.1, 203.0.113.7, 10.0.0.2"))).toBe("203.0.113.7");
    expect(twoHops.requestAddress(forwarded("10.0.0.2"))).toBe("local");

    const invalidHops = load({ TRUSTED_PROXY_HOPS: "0" });
    expect(invalidHops.requestAddress(forwarded("1.1.1.1, 203.0.113.7"))).toBe("local");
    expect(twoHops.requestAddress(forwarded("203.0.113.7,,10.0.0.2"))).toBe("local");
    expect(oneHop.requestAddress(forwarded("999.999.999.999"))).toBe("local");
    expect(oneHop.requestAddress(forwarded("2001:0DB8:0000::1"))).toBe("2001:db8::1");
    expect(oneHop.requestAddress(new Request("https://studyai.invalid"))).toBe("local");
  });

  test("clientAddressSource indica configuração ausente em produção sem proxy confiável", () => {
    const load = (env: Record<string, string>) => loadModule(
      "src/server/security/RateLimit.ts",
      { "server-only": {}, "node:net": { isIP }, "./RateLimitService": { RateLimitService: {} } },
      { process: { env }, console: { error: () => undefined } },
    ) as { clientAddressSource: () => string };
    expect(load({ NODE_ENV: "production" }).clientAddressSource()).toBe("none");
    expect(load({ NODE_ENV: "production", TRUST_PROXY_HEADERS: "true" }).clientAddressSource()).toBe("trusted-proxy");
    expect(load({ NODE_ENV: "production", VERCEL: "1" }).clientAddressSource()).toBe("vercel");
  });

  test("aplica 429 nos 5 endpoints de auth após exceder limite e não consome cota em payload inválido", async () => {
    const counts = new Map<string, number>();
    let failRateLimitDb = false;

    const rateLimitMod = {
      requestAddress: () => "203.0.113.10",
      rateLimitStrict: async (key: string, limit: number) => {
        if (failRateLimitDb) {
          return {
            allowed: false,
            remaining: 0,
            limit,
            resetAt: new Date(Date.now() + 60_000).toISOString(),
            retryAfter: 60,
            unavailable: true as const,
          };
        }
        const next = (counts.get(key) ?? 0) + 1;
        counts.set(key, next);
        return {
          allowed: next <= limit,
          remaining: Math.max(0, limit - next),
          limit,
          resetAt: new Date(Date.now() + 60_000).toISOString(),
          retryAfter: 60,
        };
      },
    };
    const authHttpMock = {
      apiError: (error: unknown) =>
        error instanceof Response ? error : FakeNextResponse.json({ error: String(error) }, { status: 400 }),
      clearAuthCookies: () => undefined,
      jsonBody: async (req: Request) => req.json(),
      publicOrigin: () => "https://studyai.invalid",
      requireCsrf: () => undefined,
      requireUser: () => ({ sub: "user-rl", email: "u@example.com", sessionId: "sess-rl" }),
      requireActiveSession: async () => ({ sub: "user-rl", email: "u@example.com", sessionId: "sess-rl" }),
      setAuthCookies: () => undefined,
    };
    const baseDeps = {
      "next/server": { NextResponse: FakeNextResponse },
      "@/server/auth/http": authHttpMock,
      "@/server/security/RateLimit": rateLimitMod,
      "@/server/security/RateLimitHttp": loadModule("src/server/security/RateLimitHttp.ts", {
        "server-only": {},
        "next/server": { NextResponse: FakeNextResponse },
      }),
      "@/server/security/Crypto": { hashToken: (v: string) => `hash-${v}` },
      "@/server/auth/EmailService": {
        EmailService: { requireConfiguration: () => undefined, sendVerification: async () => undefined },
      },
      "@/server/cloud/CloudDatabase": {
        CloudDatabase: {
          devices: async () => [{ id: "sess-rl", deviceId: "real-dev-1", deviceName: "Browser" }],
          userById: async () => ({ id: "user-rl", email: "u@example.com" }),
          deleteAccount: async () => undefined,
        },
      },
      "@/server/auth/AuthService": {
        AuthService: {
          resetPassword: async () => undefined,
          verifyEmail: async () => undefined,
          changePassword: async () => undefined,
          changeEmail: async () => ({ email: "new@example.com", verificationToken: "vt" }),
          createSession: async (_u: string, _e: string, devId: string) => ({
            accessToken: "a",
            refreshToken: "r",
            csrfToken: "c",
            expiresIn: 900,
            sessionId: "new-sess",
            devId,
          }),
        },
      },
    };

    const resetRoute = loadModule("src/app/auth/reset/route.ts", baseDeps) as { POST: (r: Request) => Promise<Response> };
    const verifyRoute = loadModule("src/app/auth/verify/route.ts", baseDeps) as { POST: (r: Request) => Promise<Response> };
    const changePassRoute = loadModule("src/app/auth/change-password/route.ts", baseDeps) as { POST: (r: Request) => Promise<Response> };
    const changeEmailRoute = loadModule("src/app/auth/change-email/route.ts", baseDeps) as { POST: (r: Request) => Promise<Response> };
    const accountRoute = loadModule("src/app/auth/account/route.ts", baseDeps) as { DELETE: (r: Request) => Promise<Response> };

    // Payload inválido não consome cota
    const badReset = await resetRoute.POST(
      new Request("https://studyai.invalid/auth/reset", { method: "POST", body: JSON.stringify({ token: "" }) }),
    );
    expect(badReset.status).toBe(400);
    expect(counts.size).toBe(0);

    // Exceder limite de reset (5)
    for (let i = 0; i < 5; i++) {
      const r = await resetRoute.POST(
        new Request("https://studyai.invalid/auth/reset", {
          method: "POST",
          body: JSON.stringify({ token: `tok-${i}`, password: NEW_PASSWORD }),
        }),
      );
      expect(r.status).toBe(200);
    }
    const blockedReset = await resetRoute.POST(
      new Request("https://studyai.invalid/auth/reset", {
        method: "POST",
        body: JSON.stringify({ token: "tok-6", password: NEW_PASSWORD }),
      }),
    );
    expect(blockedReset.status).toBe(429);

    // Exceder verify (10 por IP)
    for (let i = 0; i < 10; i++) {
      const r = await verifyRoute.POST(
        new Request("https://studyai.invalid/auth/verify", {
          method: "POST",
          body: JSON.stringify({ token: `vtok-${i}` }),
        }),
      );
      expect(r.status).toBe(200);
    }
    const blockedVerify = await verifyRoute.POST(
      new Request("https://studyai.invalid/auth/verify", {
        method: "POST",
        body: JSON.stringify({ token: "vtok-11" }),
      }),
    );
    expect(blockedVerify.status).toBe(429);

    // Exceder change-password (5)
    for (let i = 0; i < 5; i++) {
      const r = await changePassRoute.POST(
        new Request("https://studyai.invalid/auth/change-password", {
          method: "POST",
          body: JSON.stringify({ currentPassword: PASSWORD, password: NEW_PASSWORD }),
        }),
      );
      expect(r.status).toBe(200);
    }
    const blockedChangePass = await changePassRoute.POST(
      new Request("https://studyai.invalid/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: PASSWORD, password: NEW_PASSWORD }),
      }),
    );
    expect(blockedChangePass.status).toBe(429);

    // Exceder change-email (5)
    for (let i = 0; i < 5; i++) {
      const r = await changeEmailRoute.POST(
        new Request("https://studyai.invalid/auth/change-email", {
          method: "POST",
          body: JSON.stringify({ password: PASSWORD, email: `n${i}@example.com` }),
        }),
      );
      expect(r.status).toBe(200);
    }
    const blockedChangeEmail = await changeEmailRoute.POST(
      new Request("https://studyai.invalid/auth/change-email", {
        method: "POST",
        body: JSON.stringify({ password: PASSWORD, email: "n6@example.com" }),
      }),
    );
    expect(blockedChangeEmail.status).toBe(429);

    // Exceder DELETE /auth/account (5)
    for (let i = 0; i < 5; i++) {
      const r = await accountRoute.DELETE(
        new Request("https://studyai.invalid/auth/account", {
          method: "DELETE",
          body: JSON.stringify({ confirmation: "EXCLUIR" }),
        }),
      );
      expect(r.status).toBe(200);
    }
    const blockedAccount = await accountRoute.DELETE(
      new Request("https://studyai.invalid/auth/account", {
        method: "DELETE",
        body: JSON.stringify({ confirmation: "EXCLUIR" }),
      }),
    );
    expect(blockedAccount.status).toBe(429);

    // Backend indisponível em produção falha fechado com 503
    failRateLimitDb = true;
    const dbDownReset = await resetRoute.POST(
      new Request("https://studyai.invalid/auth/reset", {
        method: "POST",
        body: JSON.stringify({ token: "tok-db", password: NEW_PASSWORD }),
      }),
    );
    expect(dbDownReset.status).toBe(503);
  });
});
