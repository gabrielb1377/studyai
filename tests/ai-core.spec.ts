import { expect, test, type Page } from "@playwright/test";

const checkedAt = "2026-09-14T15:30:00.000Z";

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

test("configuração manual persiste e uma falha total não remove a pergunta do Tutor", async ({ page }) => {
  await mockManager(page);
  await page.goto("/configuracoes");
  const provider = page.getByLabel("Provider de IA");
  await provider.selectOption("groq");
  await page.reload();
  await expect(provider).toHaveValue("groq");

  await page.route("**/api/tutor", (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ error: "Nenhum provider de IA está disponível." }),
  }));
  await page.goto("/tutor");
  await page.getByRole("button", { name: "Nova conversa" }).first().click();
  await page.getByLabel("Mensagem para o Tutor IA").fill("Explique o tema atual");
  await page.getByRole("button", { name: "Enviar" }).click();

  await expect(
    page.getByRole("alert").filter({ hasText: "Nenhum provider de IA está disponível." }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Conversa com o Tutor IA" })
      .getByText("Explique o tema atual", { exact: true }),
  ).toBeVisible();
});

test("Provider Manager mostra health e envia o modelo Ollama salvo pelo AI Core", async ({ page }) => {
  await mockManager(page);
  await page.goto("/configuracoes");
  await page.getByLabel("Provider de IA").selectOption("ollama");
  await expect(page.getByText("0.32.14", { exact: true })).toBeVisible();
  await expect(page.getByText("14 ms", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("4.0 GB", { exact: true })).toBeVisible();

  const model = page.getByLabel("Modelo do Ollama");
  await model.selectOption("qwen3:8b");
  await page.reload();
  await expect(page.getByLabel("Provider de IA")).toHaveValue("ollama");
  await expect(model).toHaveValue("qwen3:8b");

  const requests: Array<Record<string, unknown>> = [];
  await page.route("**/api/tutor", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ provider: "ollama", model: "qwen3:8b", text: "Resposta local." }),
    });
  });
  await page.goto("/tutor");
  await page.getByRole("button", { name: "Nova conversa" }).first().click();
  await page.getByLabel("Mensagem para o Tutor IA").fill("Explique vetores");
  await page.getByRole("button", { name: "Enviar" }).click();

  await expect(
    page.getByRole("region", { name: "Conversa com o Tutor IA" })
      .getByText("Resposta local.", { exact: true }),
  ).toBeVisible();
  expect(requests[0]).toMatchObject({
    mode: "manual",
    provider: "ollama",
    model: "qwen3:8b",
    models: { ollama: "qwen3:8b" },
  });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("studyai:ai-settings") ?? "null")))
    .toMatchObject({ version: 3, mode: "manual", provider: "ollama", models: { ollama: "qwen3:8b" } });
});

test("modo automático escolhe o provider online de menor latência e atualiza o Dashboard", async ({ page }) => {
  await mockManager(page);
  await page.goto("/configuracoes");
  await page.getByRole("button", { name: "Automático" }).click();
  await expect(page.getByText(/Provider atual:/)).toContainText("ollama");
  await expect(page.getByLabel("Provider de IA")).toBeDisabled();

  await page.goto("/");
  await page.getByRole("button", { name: "Detalhes da ingestão" }).click();
  const diagnostics = page.getByRole("dialog", { name: "Detalhes da ingestão" });
  await expect(diagnostics).toContainText("420 ms");
  await expect(diagnostics).toContainText("1.234");

  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("studyai:ai-settings") ?? "null")))
    .toMatchObject({ version: 3, mode: "automatic" });
});
