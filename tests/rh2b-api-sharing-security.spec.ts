import { expect, test, type APIRequestContext } from "@playwright/test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const testRequire = createRequire(__filename);
const PASSWORD = "StudyAI2026secure";
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
      ReadableStream,
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
    if (firstPart.startsWith(`${name}=`)) return firstPart.slice(name.length + 1);
  }
  return undefined;
}

async function createUserSession(request: APIRequestContext, email: string) {
  const registerRes = await request.post("/auth/register", {
    data: {
      name: "Pessoa Teste",
      email,
      password: PASSWORD,
      deviceId: `dev-${crypto.randomUUID()}`,
      deviceName: "Playwright",
    },
  });
  expect(registerRes.status()).toBe(201);
  const setCookies = registerRes
    .headersArray()
    .filter((h) => h.name.toLowerCase() === "set-cookie")
    .map((h) => h.value);
  const access = parseCookiePair(setCookies, "studyai_access") ?? "";
  const csrf = parseCookiePair(setCookies, "studyai_csrf") ?? "";
  const sessionRes = await request.get("/auth/session", {
    headers: { cookie: `studyai_access=${access}` },
  });
  expect(sessionRes.status()).toBe(200);
  const session = (await sessionRes.json()) as { user: { id: string } };
  return { userId: session.user.id, access, csrf };
}

function validLabReviewPayload() {
  return {
    provider: "gemini" as const,
    mode: "manual" as const,
    request: {
      projectId: "proj-1",
      language: "javascript" as const,
      statement: "Crie uma função que soma dois números.",
      answer: "function sum(a, b) { return a + b; }",
      expectedResult: "sum(2, 3) === 5",
      errors: [],
      context: [],
    },
  };
}

test.describe("RH-2B — R-05 Compartilhamento privado e rate limit", () => {
  test("protege compartilhamento privado por proprietário, rejeita accessLevel edit/comment, trata expiração/revogação e isola usuários", async ({
    playwright,
    browser,
    baseURL,
  }) => {
    const reqA = await playwright.request.newContext({ baseURL });
    const reqB = await playwright.request.newContext({ baseURL });
    const anonReq = await playwright.request.newContext({ baseURL });
    try {
      const userA = await createUserSession(reqA, uniqueEmail("share-a"));
      const userB = await createUserSession(reqB, uniqueEmail("share-b"));

      const headersA = {
        cookie: `studyai_access=${userA.access}; studyai_csrf=${userA.csrf}`,
        "x-csrf-token": userA.csrf,
        "x-studyai-session-user": userA.userId,
      };
      const headersB = {
        cookie: `studyai_access=${userB.access}; studyai_csrf=${userB.csrf}`,
        "x-csrf-token": userB.csrf,
        "x-studyai-session-user": userB.userId,
      };

      // Sincroniza uma nota para User A compartilhar
      const syncRes = await reqA.post("/sync", {
        headers: headersA,
        data: {
          mutations: [
            {
              entity: "notes",
              recordId: "priv-note-1",
              operation: "upsert",
              baseVersion: 0,
              updatedAt: new Date().toISOString(),
              hash: "hash-priv-1",
              deviceId: "dev-a",
              data: { title: "Segredo A", content: "Conteúdo privado de A" },
            },
          ],
        },
      });
      expect(syncRes.status()).toBe(200);

      // Rejeita accessLevel 'edit' e 'comment' não suportados pelo servidor
      const editAttempt = await reqA.post("/share", {
        headers: headersA,
        data: { entity: "notes", recordId: "priv-note-1", visibility: "private", accessLevel: "edit" },
      });
      expect(editAttempt.status()).toBe(400);

      const commentAttempt = await reqA.post("/share", {
        headers: headersA,
        data: { entity: "notes", recordId: "priv-note-1", visibility: "private", accessLevel: "comment" },
      });
      expect(commentAttempt.status()).toBe(400);

      // Rejeita expiração no passado
      const pastExpire = await reqA.post("/share", {
        headers: headersA,
        data: {
          entity: "notes",
          recordId: "priv-note-1",
          visibility: "private",
          expiresAt: new Date(Date.now() - 60_000).toISOString(),
        },
      });
      expect(pastExpire.status()).toBe(400);

      // Cria compartilhamento privado válido
      const createPrivate = await reqA.post("/share", {
        headers: headersA,
        data: { entity: "notes", recordId: "priv-note-1", visibility: "private", accessLevel: "read" },
      });
      expect(createPrivate.status()).toBe(201);
      const privateJson = (await createPrivate.json()) as {
        share: { id: string; token: string; visibility: string; accessLevel: string };
      };
      expect(privateJson.share.visibility).toBe("private");
      expect(privateJson.share.accessLevel).toBe("read");

      // Proprietário A acessa JSON e página /compartilhar/<token>
      const ownerGet = await reqA.get(`/share?token=${privateJson.share.token}`, { headers: headersA });
      expect(ownerGet.status()).toBe(200);
      expect(await ownerGet.text()).toContain("Conteúdo privado de A");

      const ownerPage = await reqA.get(`/compartilhar/${privateJson.share.token}`, { headers: headersA });
      expect(ownerPage.status()).toBe(200);
      expect(await ownerPage.text()).toContain("Conteúdo privado de A");

      // Outro usuário autenticado B é bloqueado (403 no /share e Acesso restrito na página sem vazar conteúdo)
      const userBGet = await reqB.get(`/share?token=${privateJson.share.token}`, { headers: headersB });
      expect(userBGet.status()).toBe(403);
      expect(await userBGet.text()).not.toContain("Conteúdo privado de A");

      const userBPage = await reqB.get(`/compartilhar/${privateJson.share.token}`, { headers: headersB });
      expect(userBPage.status()).toBe(200);
      const userBHtml = await userBPage.text();
      expect(userBHtml).toContain("Acesso restrito");
      expect(userBHtml).not.toContain("Conteúdo privado de A");
      expect(userBHtml).not.toContain("priv-note-1");

      // Usuário anônimo é bloqueado (401 no /share e redirecionado para /conta na página sem expor conteúdo)
      const anonGet = await anonReq.get(`/share?token=${privateJson.share.token}`);
      expect(anonGet.status()).toBe(401);

      const anonPage = await anonReq.get(`/compartilhar/${privateJson.share.token}`);
      const anonHtml = await anonPage.text();
      expect(anonHtml).not.toContain("Conteúdo privado de A");
      expect(anonHtml).not.toContain("priv-note-1");
      expect(anonHtml).toContain("/conta");

      const anonBrowser = await browser.newContext();
      try {
        const bPage = await anonBrowser.newPage();
        await bPage.goto(`/compartilhar/${privateJson.share.token}`);
        await expect(bPage).toHaveURL(/\/conta/);
      } finally {
        await anonBrowser.close();
      }

      // Isolamento da lista e DELETE por outro usuário
      const listB = await (await reqB.get("/share", { headers: headersB })).json() as { shares: Array<{ id: string }> };
      expect(listB.shares).toHaveLength(0);
      await reqB.delete("/share", { headers: headersB, data: { id: privateJson.share.id } });
      expect((await reqA.get(`/share?token=${privateJson.share.token}`, { headers: headersA })).status()).toBe(200);

      // Revogação efetiva por A -> 404 em /share e sem conteúdo na página /compartilhar/<token>
      const revokeRes = await reqA.delete("/share", { headers: headersA, data: { id: privateJson.share.id } });
      expect(revokeRes.status()).toBe(200);
      expect((await reqA.get(`/share?token=${privateJson.share.token}`, { headers: headersA })).status()).toBe(404);
      const revokedPageHtml = await (await reqA.get(`/compartilhar/${privateJson.share.token}`, { headers: headersA })).text();
      expect(revokedPageHtml).not.toContain("Conteúdo privado de A");
      expect(revokedPageHtml).not.toContain("priv-note-1");

      // Token inválido/malformado -> 404 sem enumeração
      expect((await anonReq.get("/share?token=invalido")).status()).toBe(404);
      expect((await anonReq.get(`/share?token=${"0".repeat(64)}`)).status()).toBe(404);

      // Link público continua acessível para anônimo, B e A
      const createPublic = await reqA.post("/share", {
        headers: headersA,
        data: { entity: "notes", recordId: "priv-note-1", visibility: "public" },
      });
      expect(createPublic.status()).toBe(201);
      const publicToken = ((await createPublic.json()) as { share: { token: string } }).share.token;
      expect((await anonReq.get(`/share?token=${publicToken}`)).status()).toBe(200);
      expect((await reqB.get(`/share?token=${publicToken}`, { headers: headersB })).status()).toBe(200);
    } finally {
      await reqA.dispose();
      await reqB.dispose();
      await anonReq.dispose();
    }
  });

  test("aplica rate limiting em /share e rejeita token expirado", async () => {
    const counts = new Map<string, number>();
    const expiredShare = {
      share: {
        id: "s-exp",
        userId: "user-1",
        token: "a".repeat(64),
        entity: "notes",
        recordId: "n-1",
        visibility: "public",
        accessLevel: "read",
        expiresAt: new Date(Date.now() - 10_000).toISOString(),
        createdAt: new Date().toISOString(),
      },
      record: { data: { content: "expirado" } },
    };

    const route = loadModule("src/app/share/route.ts", {
      "next/server": { NextResponse: FakeNextResponse },
      "@/server/cloud/CloudDatabase": {
        CloudDatabase: {
          shareByToken: async (token: string) =>
            token === expiredShare.share.token ? undefined : null,
          shares: async () => [],
        },
      },
      "@/server/auth/http": {
        apiError: (error: unknown) => (error instanceof Response ? error : FakeNextResponse.json({ error: String(error) }, { status: 400 })),
        jsonBody: async (r: Request) => r.json(),
        publicOrigin: () => "https://studyai.invalid",
        requireCsrf: () => undefined,
        requireUser: () => ({ sub: "user-1", sessionId: "sess-1" }),
        requireActiveSession: async () => ({ sub: "user-1", sessionId: "sess-1" }),
      },
      "@/server/cloud/types": { syncEntities: ["notes"] },
      "@/server/security/RateLimit": {
        requestAddress: () => "198.51.100.1",
        rateLimit: async (key: string, limit: number) => {
          const next = (counts.get(key) ?? 0) + 1;
          counts.set(key, next);
          return {
            allowed: next <= limit,
            remaining: Math.max(0, limit - next),
            limit,
            resetAt: new Date(Date.now() + 60_000).toISOString(),
          };
        },
      },
    }) as { GET: (req: Request) => Promise<Response> };

    // Token expirado retorna 404
    const expRes = await route.GET(new Request(`https://studyai.invalid/share?token=${expiredShare.share.token}`));
    expect(expRes.status).toBe(404);

    // Após 60 consultas de GET ?token=..., retorna 429
    for (let i = 1; i < 60; i++) {
      const r = await route.GET(new Request(`https://studyai.invalid/share?token=${"b".repeat(64)}`));
      expect(r.status).toBe(404);
    }
    const blocked = await route.GET(new Request(`https://studyai.invalid/share?token=${"b".repeat(64)}`));
    expect(blocked.status).toBe(429);
  });
});

test.describe("RH-2B — R-08A Cotas de IA e validação pré-consumo em /api/lab/review", () => {
  test("rejeita payloads inválidos (vazio, malformado, campos ausentes, tipos, >128KB) sem consumir cota", async ({
    playwright,
    baseURL,
  }) => {
    const req = await playwright.request.newContext({ baseURL });
    const anonReq = await playwright.request.newContext({ baseURL });
    try {
      const user = await createUserSession(req, uniqueEmail("r08a-lab"));
      const headers = {
        cookie: `studyai_access=${user.access}; studyai_csrf=${user.csrf}`,
        "x-csrf-token": user.csrf,
      };

      const quotaBefore = (await (await req.get("/api/settings/ai/quota", { headers })).json()) as {
        daily: { used: number };
        minute: { used: number };
      };

      // Sem CSRF -> 403; com CSRF mas sem cookie de acesso -> 401
      expect((await anonReq.post("/api/lab/review", { data: validLabReviewPayload() })).status()).toBe(403);
      expect(
        (
          await anonReq.post("/api/lab/review", {
            headers: { cookie: "studyai_csrf=csrf-only", "x-csrf-token": "csrf-only" },
            data: validLabReviewPayload(),
          })
        ).status(),
      ).toBe(401);
      expect(
        (
          await req.post("/api/lab/review", {
            headers: { cookie: `studyai_access=${user.access}; studyai_csrf=${user.csrf}` },
            data: validLabReviewPayload(),
          })
        ).status(),
      ).toBe(403);

      // 1. Body vazio
      const emptyRes = await req.post("/api/lab/review", { headers, data: "" });
      expect(emptyRes.status()).toBe(400);

      // 2. JSON malformado
      const malformedRes = await req.post("/api/lab/review", {
        headers: { ...headers, "content-type": "application/json" },
        data: "{invalid-json",
      });
      expect(malformedRes.status()).toBe(400);

      // 3. Campos ausentes
      const missingRes = await req.post("/api/lab/review", { headers, data: { provider: "gemini" } });
      expect(missingRes.status()).toBe(400);

      // 4. Tipos inválidos
      const badTypesRes = await req.post("/api/lab/review", {
        headers,
        data: { provider: "invalid-provider", request: { projectId: 123 } },
      });
      expect(badTypesRes.status()).toBe(400);

      // 5. Payload acima do limite (128 KB) -> 413
      const oversizedPayload = {
        ...validLabReviewPayload(),
        extra: "x".repeat(140 * 1024),
      };
      const oversizedRes = await req.post("/api/lab/review", { headers, data: oversizedPayload });
      expect(oversizedRes.status()).toBe(413);

      const quotaAfter = (await (await req.get("/api/settings/ai/quota", { headers })).json()) as {
        daily: { used: number };
        minute: { used: number };
      };
      expect(quotaAfter.daily.used).toBe(quotaBefore.daily.used);
      expect(quotaAfter.minute.used).toBe(quotaBefore.minute.used);
    } finally {
      await req.dispose();
      await anonReq.dispose();
    }
  });

  test("executa fluxo válido, respeita BYOK, limite 429, concorrência e falha controlada de IA sem dupla contabilização", async () => {
    let sharedConsumptions = 0;
    const minuteLimit = 3;
    let userByok: Record<string, string> = {};
    let aiMode: "ok" | "fail" = "ok";

    const httpMod = loadModule("src/server/auth/http.ts", {
      "server-only": {},
      "next/server": { NextResponse: FakeNextResponse },
      "./AuthService": { AuthService: { access: () => ({ sub: "user-q", email: "q@example.com", sessionId: "s-q", type: "access" }), isSessionActive: async () => true } },
      "@/server/security/Crypto": { constantTimeEqual: (a: string, b: string) => a === b },
    });

    const quotaMiddlewareMod = loadModule("src/server/ai/QuotaMiddleware.ts", {
      "next/server": { NextResponse: FakeNextResponse },
      "./QuotaService": {
        QuotaService: {
          getQuotaInfo: async () => ({
            daily: { used: sharedConsumptions, limit: 500, remaining: Math.max(0, 500 - sharedConsumptions), resetAt: new Date(Date.now() + 86_400_000).toISOString() },
            minute: { used: sharedConsumptions, limit: minuteLimit, remaining: Math.max(0, minuteLimit - sharedConsumptions), resetAt: new Date(Date.now() + 60_000).toISOString() },
            sharedKeysUsed: true,
          }),
          checkAndConsume: async () => {
            sharedConsumptions += 1;
            const allowed = sharedConsumptions <= minuteLimit;
            return {
              allowed,
              remaining: Math.max(0, minuteLimit - sharedConsumptions),
              limit: minuteLimit,
              resetAt: new Date(Date.now() + 60_000).toISOString(),
              retryAfter: allowed ? undefined : 60,
              blockedBy: allowed ? undefined : "minute",
              quota: {
                daily: { used: sharedConsumptions, limit: 500, remaining: Math.max(0, 500 - sharedConsumptions), resetAt: new Date(Date.now() + 86_400_000).toISOString() },
                minute: { used: sharedConsumptions, limit: minuteLimit, remaining: Math.max(0, minuteLimit - sharedConsumptions), resetAt: new Date(Date.now() + 60_000).toISOString() },
                sharedKeysUsed: true,
              },
            };
          },
        },
      },
      "@/server/auth/http": {
        ...httpMod,
        requireCsrf: () => undefined,
        requireUser: () => ({ sub: "user-q", sessionId: "s-q" }),
        requireActiveSession: async () => ({ sub: "user-q", sessionId: "s-q" }),
      },
      "@/features/ai/AIProvider": loadModule("src/features/ai/AIProvider.ts", {}),
      "./ApiKeyService": { ApiKeyService: { getDecrypted: async (_u: string, p: string) => userByok[p] } },
      "@/features/ai/AIErrors": loadModule("src/features/ai/AIErrors.ts", { "@/features/ai/AIProvider": loadModule("src/features/ai/AIProvider.ts", {}) }),
      "@/features/tutor/utils/tutor-context-validation": { isTutorStudyContext: () => false },
      "@/features/retrieval/retrieval-validation": { isRetrievedChunk: () => true },
      "./AIRoutingService": { AIRoutingService: { resolve: async (req: unknown) => req } },
      "./quota-policy": loadModule("src/server/ai/quota-policy.ts", {}),
    });

    const labRoute = loadModule("src/app/api/lab/review/route.ts", {
      "next/server": { NextResponse: FakeNextResponse },
      "@/features/ai/AIErrors": loadModule("src/features/ai/AIErrors.ts", { "@/features/ai/AIProvider": loadModule("src/features/ai/AIProvider.ts", {}) }),
      "@/features/ai/AIService": {
        AIService: {
          generate: async () => {
            if (aiMode === "fail") throw new Error("UPSTREAM_FAIL");
            return { text: JSON.stringify({ status: "correct", feedback: "Correto", suggestions: [], score: 100 }), provider: "gemini", model: "gemini-test" };
          },
        },
      },
      "@/features/lab/services/LabPromptBuilder": { LabPromptBuilder: { review: () => "review prompt" } },
      "@/features/lab/validators/lab-validation": { isLabReviewRequest: (v: unknown) => Boolean(v && typeof v === "object" && "projectId" in v && typeof (v as { projectId: unknown }).projectId === "string") },
      "@/features/ai/AIProvider": loadModule("src/features/ai/AIProvider.ts", {}),
      "@/server/ai/QuotaMiddleware": quotaMiddlewareMod,
    }) as { POST: (req: Request) => Promise<Response> };

    const makeReq = (body: unknown) =>
      new Request("https://studyai.invalid/api/lab/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: typeof body === "string" ? body : JSON.stringify(body),
      });

    // Inválidos não consomem cota
    expect((await labRoute.POST(makeReq({ request: { projectId: 123 } }))).status).toBe(400);
    expect((await labRoute.POST(makeReq("{bad"))).status).toBe(400);
    expect(sharedConsumptions).toBe(0);

    // BYOK ignora cota compartilhada
    userByok = { gemini: "AIza-user-byok" };
    const byokRes = await labRoute.POST(makeReq(validLabReviewPayload()));
    expect(byokRes.status).toBe(200);
    expect(sharedConsumptions).toBe(0);

    // Chave compartilhada consome exatamente 1 por requisição válida + concorrência
    userByok = {};
    const validRes = await labRoute.POST(makeReq(validLabReviewPayload()));
    expect(validRes.status).toBe(200);
    expect(sharedConsumptions).toBe(1);

    // Falha controlada de IA
    aiMode = "fail";
    const failRes = await labRoute.POST(makeReq(validLabReviewPayload()));
    expect(failRes.status).not.toBe(200);
    expect(sharedConsumptions).toBe(2);

    // Requisições concorrentes: 1 aceita (3/3) e 1 bloqueada com 429
    aiMode = "ok";
    const [c1, c2] = await Promise.all([
      labRoute.POST(makeReq(validLabReviewPayload())),
      labRoute.POST(makeReq(validLabReviewPayload())),
    ]);
    expect([c1.status, c2.status].sort()).toEqual([200, 429]);
  });
});

test.describe("RH-2B — R-08B Ausência de RetrievalPipeline/IndexedDB no servidor", () => {
  test("QuotaMiddleware não importa RetrievalPipeline e lida em Node.js com chunks presentes, ausentes, studyId inválido e contexto string", async () => {
    const middlewareSource = readFileSync(path.join(process.cwd(), "src/server/ai/QuotaMiddleware.ts"), "utf8");
    expect(middlewareSource).not.toContain("RetrievalPipeline");
    expect(middlewareSource).not.toContain("indexedDB");

    const promptBuilderCalls: Array<Record<string, unknown>> = [];
    const quotaMiddleware = loadModule(
      "src/server/ai/QuotaMiddleware.ts",
      {
        "next/server": { NextResponse: FakeNextResponse },
        "./QuotaService": {
          QuotaService: {
            getQuotaInfo: async () => ({ daily: { used: 0, limit: 500, remaining: 500, resetAt: "" }, minute: { used: 0, limit: 20, remaining: 20, resetAt: "" }, sharedKeysUsed: true }),
          },
        },
        "@/server/auth/http": {
          jsonBody: async (r: Request) => r.json(),
          requireActiveSession: async () => ({ sub: "user-1", sessionId: "s-1" }),
          requireCsrf: () => undefined,
          requireUser: () => ({ sub: "user-1", sessionId: "s-1" }),
        },
        "@/features/ai/AIProvider": loadModule("src/features/ai/AIProvider.ts", {}),
        "./ApiKeyService": { ApiKeyService: { getDecrypted: async () => undefined } },
        "@/features/ai/AIErrors": { AIError: class extends Error {}, normalizeAIError: () => ({ status: 500, body: {} }) },
        "@/features/ai/PromptBuilder": {
          PromptBuilder: {
            contextual: (input: Record<string, unknown>) => {
              promptBuilderCalls.push(input);
              return { history: [], message: String(input.question ?? "") };
            },
          },
        },
        "@/features/tutor/utils/tutor-context-validation": loadModule("src/features/tutor/utils/tutor-context-validation.ts", {}),
        "@/features/retrieval/retrieval-validation": loadModule("src/features/retrieval/retrieval-validation.ts", {}),
        "./AIRoutingService": { AIRoutingService: { resolve: async (req: unknown) => req } },
        "./quota-policy": loadModule("src/server/ai/quota-policy.ts", {}),
      },
      { indexedDB: undefined },
    ) as {
      createQuotaAwareAIRequest: (
        req: Request,
        body: Record<string, unknown>,
        userId: string,
        keys: Record<string, string>,
      ) => Promise<Record<string, unknown>>;
    };

    // 1. Chunks ausentes + studyId sem IndexedDB -> continua com chunks vazios e não acessa IDB
    await quotaMiddleware.createQuotaAwareAIRequest(
      new Request("https://studyai.invalid/api/tutor"),
      {
        history: [],
        message: "Explique árvores AVL",
        context: {
          studyId: "study-1",
          title: "Estruturas",
          subject: "Computação",
          topic: "AVL",
          status: "in_progress",
          progress: 20,
          notes: [],
        },
      },
      "user-1",
      {},
    );
    expect(promptBuilderCalls.at(-1)?.chunks).toEqual([]);
    expect((promptBuilderCalls.at(-1)?.studyContext as { studyId?: string })?.studyId).toBe("study-1");

    // 2. Contexto parcial / studyId de outro contexto ou string -> não quebra ContextBuilder
    await quotaMiddleware.createQuotaAwareAIRequest(
      new Request("https://studyai.invalid/api/diagrams/generate"),
      {
        history: [],
        message: "Gere diagrama",
        context: "Contexto textual de diagrama",
      },
      "user-1",
      {},
    );
    expect(promptBuilderCalls.at(-1)?.studyContext).toBeUndefined();
    expect(promptBuilderCalls.at(-1)?.chunks).toEqual([]);

    // 3. Chunks válidos enviados explicitamente são preservados e inválidos são descartados
    const validChunk = {
      id: "c1",
      fileId: "f1",
      studyId: "study-1",
      text: "Rotação simples à direita equilibra árvore AVL.",
      score: 0.95,
      matchedTerms: ["rotação", "avl"],
      chunkIndex: 0,
      metadata: {
        extractedContentId: "ec-1",
        fileType: "pdf",
        mimeType: "application/pdf",
        size: 1024,
        sourceName: "avl.pdf",
        pageStart: 1,
        pageEnd: 1,
      },
    };
    await quotaMiddleware.createQuotaAwareAIRequest(
      new Request("https://studyai.invalid/api/tutor"),
      {
        history: [],
        message: "O que é rotação?",
        chunks: [validChunk, { bad: true }],
      },
      "user-1",
      {},
    );
    expect(promptBuilderCalls.at(-1)?.chunks).toEqual([validChunk]);
  });
});

test.describe("RH-2B — R-08C Limites e isolamento em /api/collaboration/rooms/[roomId]/resources", () => {
  test("impõe maxBytes (413 inclusive sem Content-Length), rejeita JSON inválido/vazio (400), valida autorização e concorrência", async ({
    playwright,
    baseURL,
  }) => {
    const reqA = await playwright.request.newContext({ baseURL });
    const reqB = await playwright.request.newContext({ baseURL });
    const anonReq = await playwright.request.newContext({ baseURL });
    try {
      const userA = await createUserSession(reqA, uniqueEmail("r08c-a"));
      const userB = await createUserSession(reqB, uniqueEmail("r08c-b"));

      const headersA = {
        cookie: `studyai_access=${userA.access}; studyai_csrf=${userA.csrf}`,
        "x-csrf-token": userA.csrf,
      };
      const headersB = {
        cookie: `studyai_access=${userB.access}; studyai_csrf=${userB.csrf}`,
        "x-csrf-token": userB.csrf,
      };

      const createRoomRes = await reqA.post("/api/collaboration/rooms", {
        headers: headersA,
        data: { name: "Sala Segura", kind: "study" },
      });
      expect(createRoomRes.status()).toBe(201);
      const { room } = (await createRoomRes.json()) as { room: { id: string } };

      // 1. Não autenticado / sem CSRF -> 403 sem CSRF e 401 sem acesso
      expect(
        (
          await anonReq.post(`/api/collaboration/rooms/${room.id}/resources`, {
            data: { type: "note", title: "Teste", data: {} },
          })
        ).status(),
      ).toBe(403);
      expect(
        (
          await anonReq.post(`/api/collaboration/rooms/${room.id}/resources`, {
            headers: { cookie: "studyai_csrf=csrf-only", "x-csrf-token": "csrf-only" },
            data: { type: "note", title: "Teste", data: {} },
          })
        ).status(),
      ).toBe(401);

      // 2. Usuário sem acesso à sala -> 404; sala inexistente -> 404
      expect(
        (
          await reqB.post(`/api/collaboration/rooms/${room.id}/resources`, {
            headers: headersB,
            data: { type: "note", title: "Invasão", data: {} },
          })
        ).status(),
      ).toBe(404);
      expect(
        (
          await reqA.post("/api/collaboration/rooms/sala-inexistente/resources", {
            headers: headersA,
            data: { type: "note", title: "Inexistente", data: {} },
          })
        ).status(),
      ).toBe(404);

      // 3. Body vazio e JSON inválido -> 400
      expect(
        (
          await reqA.post(`/api/collaboration/rooms/${room.id}/resources`, {
            headers: { ...headersA, "content-type": "application/json" },
            data: "",
          })
        ).status(),
      ).toBe(400);
      expect(
        (
          await reqA.post(`/api/collaboration/rooms/${room.id}/resources`, {
            headers: { ...headersA, "content-type": "application/json" },
            data: "{malformed",
          })
        ).status(),
      ).toBe(400);

      // 4. Payload acima de 256 KB -> 413 e não grava recurso parcial
      const oversizedRes = await reqA.post(`/api/collaboration/rooms/${room.id}/resources`, {
        headers: headersA,
        data: { type: "note", title: "Grande", data: { content: "a".repeat(270 * 1024) } },
      });
      expect(oversizedRes.status()).toBe(413);

      const snapshotAfterOversize = (await (
        await reqA.get(`/api/collaboration/rooms/${room.id}`, { headers: headersA })
      ).json()) as { resources: unknown[] };
      expect(snapshotAfterOversize.resources).toHaveLength(0);

      // 5. Payload válido -> 201 e concorrência controlada com version conflict (409)
      const validRes = await reqA.post(`/api/collaboration/rooms/${room.id}/resources`, {
        headers: headersA,
        data: { type: "note", title: "Nota válida", data: { content: "Conteúdo seguro" } },
      });
      expect(validRes.status()).toBe(201);
      const createdResource = ((await validRes.json()) as { resource: { id: string; version: number } }).resource;

      const [patch1, patch2] = await Promise.all([
        reqA.patch(`/api/collaboration/rooms/${room.id}/resources`, {
          headers: headersA,
          data: {
            id: createdResource.id,
            type: "note",
            title: "Nota válida",
            data: { content: "Edição 1" },
            expectedVersion: createdResource.version,
          },
        }),
        reqA.patch(`/api/collaboration/rooms/${room.id}/resources`, {
          headers: headersA,
          data: {
            id: createdResource.id,
            type: "note",
            title: "Nota válida",
            data: { content: "Edição 2" },
            expectedVersion: createdResource.version,
          },
        }),
      ]);
      expect([patch1.status(), patch2.status()].sort()).toEqual([200, 409]);
    } finally {
      await reqA.dispose();
      await reqB.dispose();
      await anonReq.dispose();
    }
  });

  test("jsonBody aborta stream acima do limite sem header Content-Length (anti-OOM)", async () => {
    const httpMod = loadModule("src/server/auth/http.ts", {
      "server-only": {},
      "next/server": { NextResponse: FakeNextResponse },
      "./AuthService": { AuthService: {} },
      "@/server/security/Crypto": { constantTimeEqual: (a: string, b: string) => a === b },
    }) as { jsonBody: (req: Request, maxBytes?: number) => Promise<unknown> };

    let chunksEmitted = 0;
    const hugeStream = new ReadableStream<Uint8Array>({
      pull(controller) {
        chunksEmitted += 1;
        if (chunksEmitted > 20) {
          controller.close();
          return;
        }
        controller.enqueue(new Uint8Array(64 * 1024));
      },
    });
    const req = new Request("https://studyai.invalid/api/collaboration/rooms/r/resources", {
      method: "POST",
      body: hugeStream,
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    const error = await httpMod.jsonBody(req, 256 * 1024).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Response);
    expect((error as Response).status).toBe(413);
    expect(chunksEmitted).toBeLessThan(10);
  });
});
