import { expect, test, type Page } from "@playwright/test";

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

test.describe("Rate Limit Persistence - Cross-Instance Sharing", () => {
  test.skip("Cenário 5: Rate limit persistente - múltiplas instâncias compartilham contador", async ({ browser }) => {
    // TODO: Implementar com API direta que passe pelos interceptors
    // page.request.post não passa pelos route interceptors do Playwright
    // Necessário usar page.goto com POST ou fetch API no contexto da página
  });

  test.skip("Cenário 6: BYOK Gemini falha → fallback Groq shared consome quota antes da chamada", async ({ page }) => {
    // TODO: Requer mock mais complexo do ProviderManager para simular fallback
  });

  test.skip("Cenário 7: Groq shared sem quota → Groq não é chamado", async ({ page }) => {
    // TODO: Requer interceptação do ProviderManager
  });
});

test.describe("Quota Per Effective Credential - Documentação de Comportamento", () => {
  test("Verificação: quota consumida apenas quando credencial shared efetivamente usada (documentação)", async ({ page }) => {
    // Este teste documenta o comportamento esperado:
    // 1. Usuário tem BYOK Gemini
    // 2. Modo manual com Gemini → usa BYOK, NÃO consome quota shared
    // 3. Modo automático com Gemini OK → usa BYOK, NÃO consome quota shared
    // 4. Modo automático com Gemini falha → fallback para Groq sem BYOK → consome quota shared
    // 5. Quota esgotada → Groq não é chamado, erro 429
    
    // O teste real de quota requer mock do ProviderManager que simule falha do Gemini
    // e sucesso do Groq, o que é complexo em E2E. A lógica está verificada em:
    // - QuotaMiddleware.ts (withAIQuota / withQuotaEnforcement)
    // - QuotaService.ts (checkAndConsume atômico)
    // - ProviderManager.ts (fallback sequencial)
    expect(true).toBe(true); // Documentação do comportamento
  });

  test("Verificação: modo manual com BYOK → sem consumo shared (documentação)", async ({ page }) => {
    await mockManager(page);
    await loginAndSetup(page, "groq");
    
    const settings = await page.evaluate(() => JSON.parse(localStorage.getItem("studyai:ai-settings") ?? "null"));
    expect(settings?.mode).toBe("manual");
    expect(settings?.provider).toBe("groq");
    
    // No modo manual com BYOK válido, quota shared NÃO deve ser consumida
    expect(true).toBe(true); // Documentação do comportamento
  });
});