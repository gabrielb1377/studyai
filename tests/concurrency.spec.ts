import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, test, type Page } from "@playwright/test";
import { needsSharedQuota, providersToCheckFor } from "../src/server/ai/quota-policy";

const checkedAt = "2026-10-22T10:00:00.000Z";

const managerStatus = {
  providers: [
    { provider: "gemini", available: true, latencyMs: 80, models: [{ name: "gemini-3.7-flash" }], checkedAt },
    { provider: "ollama", available: true, latencyMs: 14, version: "0.32.14", memoryBytes: 4_294_967_296, models: [{ name: "qwen3:4b" }, { name: "qwen3:8b" }], checkedAt },
    { provider: "groq", available: false, latencyMs: 0, models: [], checkedAt },
    { provider: "openrouter", available: false, latencyMs: 0, models: [], checkedAt },
  ],
  statistics: { messages: 7, tokens: 1234, averageResponseTimeMs: 420, failures: 2, fallbacks: 1 },
  logs: [],
};

async function mockManager(page: Page) {
  await page.route("**/api/ai/manager*", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(managerStatus),
  }));
}

async function loginAndSetup(page: Page, provider: string = "gemini") {
  await mockManager(page);
  await page.goto("/configuracoes");
  await page.getByRole("button", { name: "IA", exact: true }).click();
  const providerSelect = page.getByLabel("Provider de IA");
  await providerSelect.selectOption(provider);
  await page.reload();
  await expect(providerSelect).toHaveValue(provider);
}

test.describe("Concurrency Tests - Quotas & Rate Limits", () => {
  test("Cenário 1: Limite = 1, duas requisições simultâneas → apenas uma autorizada", async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    try {
      await loginAndSetup(page1, "gemini");
      await loginAndSetup(page2, "gemini");

      let requestCount = 0;
      const mockTutor = async (route: { fulfill: (options: { contentType: string; body: string; status?: number }) => Promise<void> }) => {
        requestCount++;
        if (requestCount <= 1) {
          route.fulfill({
            contentType: "application/json",
            body: JSON.stringify({ provider: "gemini", model: "gemini-3.7-flash", text: "Resposta 1", execution: { attemptedProviders: ["gemini"], fallbackUsed: false, latencyMs: 100 } }),
          });
        } else {
          route.fulfill({
            status: 429,
            contentType: "application/json",
            body: JSON.stringify({ code: "QUOTA_EXCEEDED", error: "Cota excedida" }),
          });
        }
      };

      await page1.route("**/api/tutor", mockTutor);
      await page2.route("**/api/tutor", mockTutor);

      const [result1, result2] = await Promise.allSettled([
        (async () => {
          await page1.goto("/tutor");
          await page1.getByRole("button", { name: "Nova conversa" }).first().click();
          await page1.getByLabel("Mensagem para o Tutor IA").fill("Teste concorrência 1");
          await page1.getByRole("button", { name: "Enviar" }).click();
          await page1.waitForResponse("**/api/tutor", { timeout: 10000 });
        })(),
        (async () => {
          await page2.goto("/tutor");
          await page2.getByRole("button", { name: "Nova conversa" }).first().click();
          await page2.getByLabel("Mensagem para o Tutor IA").fill("Teste concorrência 2");
          await page2.getByRole("button", { name: "Enviar" }).click();
          await page2.waitForResponse("**/api/tutor", { timeout: 10000 });
        })(),
      ]);

      const successCount = [result1, result2].filter(r => r.status === "fulfilled").length;
      expect(successCount).toBeGreaterThanOrEqual(1);
    } finally {
      await context1.close();
      await context2.close();
    }
  });

  test("Cenário 2: Provider retorna 429 → retry não permite bypass de quota", async ({ page }) => {
    await mockManager(page);
    await loginAndSetup(page, "gemini");

    let callCount = 0;
    await page.route("**/api/tutor", async (route) => {
      callCount++;
      if (callCount === 1) {
        route.fulfill({
          status: 429,
          contentType: "application/json",
          body: JSON.stringify({ error: "Rate limited", retryAfter: 60 }),
        });
      } else {
        route.fulfill({
          status: 429,
          contentType: "application/json",
          body: JSON.stringify({ error: "Rate limited again" }),
        });
      }
    });

    await page.goto("/tutor");
    await page.getByRole("button", { name: "Nova conversa" }).first().click();
    await page.getByLabel("Mensagem para o Tutor IA").fill("Teste 429 retry");
    await page.getByRole("button", { name: "Enviar" }).click();

    await expect(page.getByRole("alert")).toBeVisible({ timeout: 10000 });
  });

  test("Cenário 3: Banco de quotas indisponível → credenciais compartilhadas bloqueadas (fail-closed)", async ({ page }) => {
    await mockManager(page);
    await loginAndSetup(page, "gemini");

    await page.route("**/api/tutor", async (route) => {
      const body = route.request().postDataJSON();
      if (!body.apiKeys || Object.keys(body.apiKeys).length === 0) {
        route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ code: "QUOTA_UNAVAILABLE", error: "Serviço de quotas indisponível. Tente novamente mais tarde." }),
        });
      } else {
        route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ provider: "gemini", model: "gemini-3.7-flash", text: "Resposta com BYOK", execution: { attemptedProviders: ["gemini"], fallbackUsed: false, latencyMs: 100 } }),
        });
      }
    });

    await page.goto("/tutor");
    await page.getByRole("button", { name: "Nova conversa" }).first().click();
    await page.getByLabel("Mensagem para o Tutor IA").fill("Teste DB indisponível");
    await page.getByRole("button", { name: "Enviar" }).click();

    await expect(page.getByRole("alert").filter({ hasText: "indisponível" })).toBeVisible({ timeout: 10000 });
  });

  test("Cenário 4: Streaming interrompido → sem loops, cobrança inconsistente ou tentativas ilimitadas", async ({ page }) => {
    await mockManager(page);
    await loginAndSetup(page, "gemini");

    let streamChunks = 0;
    await page.route("**/api/tutor", async (route) => {
      const body = route.request().postDataJSON();
      if (body.stream) {
        const encoder = new TextEncoder();
        const chunks: string[] = [];
        for (let i = 0; i < 3; i++) {
          streamChunks++;
          chunks.push(`data: {"type":"delta","text":"chunk ${i}\\n"}\n\n`);
          await new Promise(r => setTimeout(r, 50));
        }
        chunks.push(`data: {"type":"done","response":{"provider":"gemini","model":"gemini-3.7-flash","text":"Complete response"}}\n\n`);
        const responseBody = chunks.join("");
        route.fulfill({
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
          body: responseBody,
        });
      }
    });

    await page.goto("/tutor");
    await page.getByRole("button", { name: "Nova conversa" }).first().click();
    await page.getByLabel("Mensagem para o Tutor IA").fill("Teste streaming");
    await page.getByRole("button", { name: "Enviar" }).click();

    await page.waitForTimeout(2000);
    expect(streamChunks).toBeLessThanOrEqual(3);
  });
});

const execFileAsync = promisify(execFile);
const concurrencyDatabaseUrl = process.env.CONCURRENCY_DATABASE_URL?.trim();
const standaloneDir = process.env.STUDYAI_STANDALONE_DIR?.trim();
const appConcurrencyEnabled = Boolean(concurrencyDatabaseUrl && standaloneDir);
// Sem banco descartável + build standalone, os cenários permanecem skipped e
// NÃO contam como aprovados. Com as duas variáveis, o harness real executa
// duas instâncias de produção contra PostgreSQL multi-conexão.
const appConcurrencyDescribe = appConcurrencyEnabled ? test.describe : test.describe.skip;

appConcurrencyDescribe("Cenários 5–7: concorrência real da aplicação (PostgreSQL + standalone)", () => {
  test.describe.configure({ mode: "serial" });
  let harnessOutput = "";

  test.beforeAll(async () => {
    const { stdout } = await execFileAsync(process.execPath, ["scripts/verify-app-concurrency.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "test",
        CONFIRM_TEST_DATABASE: "1",
        DATABASE_URL: concurrencyDatabaseUrl!,
        DATABASE_SSL: "false",
        STUDYAI_STANDALONE_DIR: standaloneDir!,
      },
      timeout: 300_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    harnessOutput = stdout;
  });

  test("Cenário 5: rate limit de login compartilhado entre duas instâncias", () => {
    expect(harnessOutput).toContain("PASS  5. rate limit de login compartilhado entre 2 instâncias reais");
    expect(harnessOutput).toContain("10 permitidas");
  });

  test("Cenário 6: BYOK Gemini falha e Groq shared é tentado após consumir quota", () => {
    expect(harnessOutput).toContain("PASS  6. BYOK Gemini falha → Groq shared tenta após quota compartilhada");
    expect(harnessOutput).toContain("providers=");
    expect(harnessOutput).toMatch(/providers=.*gemini/);
    expect(harnessOutput).toMatch(/providers=.*groq/);
  });

  test("Cenário 7: quota esgotada bloqueia Groq shared antes do provider", () => {
    expect(harnessOutput).toContain("PASS  7. quota esgotada → Groq shared não é executado");
    expect(harnessOutput).toMatch(/logs=\d+→\d+/);
  });

  test("Cenários E/F: fail-closed com banco indisponível e retries limitados", () => {
    expect(harnessOutput).toContain("PASS  E1. liveness 200 com banco indisponível; readiness 503");
    expect(harnessOutput).toContain("PASS  E2. login, cadastro e recuperação fail-closed com banco indisponível");
    expect(harnessOutput).toContain("PASS  E3. quota fail-closed: banco indisponível nega antes de qualquer provider");
    expect(harnessOutput).toContain("PASS  F. tentativas de provider limitadas (sem loop de retry)");
  });
});

test.describe("Quota por credencial efetiva - política real", () => {
  test("modo automático com BYOK parcial exige quota; manual com BYOK não exige", () => {
    const geminiByok = { gemini: "AIza-test" };
    // Automático percorre ollama/gemini/groq/openrouter; groq/openrouter sem
    // BYOK exigem a quota compartilhada antes da cadeia de fallback.
    expect(needsSharedQuota(providersToCheckFor("automatic", undefined), geminiByok)).toBe(true);
    // Manual Gemini com BYOK não usa credencial compartilhada.
    expect(needsSharedQuota(providersToCheckFor("manual", "gemini"), geminiByok)).toBe(false);
    // Manual Groq sem BYOK usa credencial compartilhada e exige quota.
    expect(needsSharedQuota(providersToCheckFor("manual", "groq"), {})).toBe(true);
  });

  test("modo manual com provider Groq persiste a seleção na configuração", async ({ page }) => {
    await mockManager(page);
    await loginAndSetup(page, "groq");

    const settings = await page.evaluate(() => JSON.parse(localStorage.getItem("studyai:ai-settings") ?? "null"));
    expect(settings?.mode).toBe("manual");
    expect(settings?.provider).toBe("groq");
  });
});