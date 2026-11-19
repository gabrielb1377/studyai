import { expect, test, type Page, type Route } from "@playwright/test";

const offer = (requestId: string) => ({
  requestId,
  primaryProvider: "gemini",
  primaryModel: "gemini-test",
  alternatives: [{
    provider: "groq",
    model: "llama-test",
    cost: "shared_quota",
    notice: "Usa uma tentativa da cota compartilhada do StudyAI.",
  }],
});

async function openTutor(page: Page) {
  await page.goto("/tutor");
  await page.getByRole("button", { name: "Nova conversa" }).first().click();
}

function consentError(route: Route, requestId: string) {
  return route.fulfill({
    status: 200,
    contentType: "application/x-ndjson; charset=utf-8",
    body: `${JSON.stringify({
      type: "error",
      code: "FALLBACK_CONSENT_REQUIRED",
      error: "O provedor escolhido não respondeu. Confirme se deseja usar uma alternativa.",
      provider: "gemini",
      fallback: offer(requestId),
    })}\n`,
  });
}

test("Tutor só usa alternativa após consentimento e preserva a conversa", async ({ page }) => {
  const requests: Array<Record<string, unknown>> = [];
  await page.route("**/api/tutor", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    requests.push(body);
    if (!body.fallbackConsent) return consentError(route, String(body.requestId));
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        provider: "groq",
        model: "llama-test",
        text: "Resposta da alternativa autorizada.",
        execution: { fallbackUsed: true },
      }),
    });
  });

  await openTutor(page);
  const composer = page.getByLabel("Mensagem para o Tutor IA");
  await composer.fill("Explique árvores binárias");
  await page.getByRole("button", { name: "Enviar" }).click();

  const fallback = page.getByRole("complementary", { name: "Alternativa de provedor de IA" });
  await expect(fallback).toContainText("groq · llama-test");
  await expect(fallback).toContainText("cota compartilhada");
  await expect(composer).toHaveValue("Explique árvores binárias");
  expect(requests).toHaveLength(1);
  await expect(page.getByRole("region", { name: "Conversa com o Tutor IA" }).getByText("Explique árvores binárias", { exact: true })).toHaveCount(1);

  await fallback.getByRole("button", { name: "Usar esta alternativa" }).click();
  await expect(page.getByRole("region", { name: "Conversa com o Tutor IA" }).getByText("Resposta da alternativa autorizada.", { exact: true })).toBeVisible();
  await expect(page.getByText(/groq · llama-test.*fallback autorizado/)).toBeVisible();
  await expect(composer).toHaveValue("");
  await expect(page.getByRole("region", { name: "Conversa com o Tutor IA" }).getByText("Explique árvores binárias", { exact: true })).toHaveCount(1);
  expect(requests).toHaveLength(2);
  expect(requests[1]).toMatchObject({
    message: "Explique árvores binárias",
    requestId: requests[0].requestId,
    provider: "gemini",
    model: "gemini-test",
    fallbackConsent: {
      requestId: requests[0].requestId,
      originalProvider: "gemini",
      provider: "groq",
      model: "llama-test",
    },
  });
});

test("cancelamento no celular não chama alternativa nem perde o prompt", async ({ page }) => {
  const requests: Array<Record<string, unknown>> = [];
  await page.setViewportSize({ width: 360, height: 900 });
  await page.route("**/api/tutor", async (route) => {
    requests.push(route.request().postDataJSON());
    return consentError(route, String(requests.at(-1)?.requestId));
  });
  await openTutor(page);
  const composer = page.getByLabel("Mensagem para o Tutor IA");
  await composer.fill("Explique filas");
  await page.getByRole("button", { name: "Enviar" }).click();
  await page.getByRole("button", { name: "Cancelar e manter mensagem" }).click();

  await expect(page.getByRole("complementary", { name: "Alternativa de provedor de IA" })).toHaveCount(0);
  await expect(composer).toHaveValue("Explique filas");
  await expect(page.getByRole("region", { name: "Conversa com o Tutor IA" }).getByText("Explique filas", { exact: true })).toHaveCount(1);
  expect(requests).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("quota insuficiente impede a tentativa alternativa sem criar resposta simulada", async ({ page }) => {
  const requests: Array<Record<string, unknown>> = [];
  await page.route("**/api/tutor", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    requests.push(body);
    if (!body.fallbackConsent) return consentError(route, String(body.requestId));
    return route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({ code: "QUOTA_EXCEEDED", error: "Cota diária de IA compartilhada esgotada." }),
    });
  });
  await openTutor(page);
  await page.getByLabel("Mensagem para o Tutor IA").fill("Explique grafos");
  await page.getByRole("button", { name: "Enviar" }).click();
  await page.getByRole("button", { name: "Usar esta alternativa" }).click();

  await expect(page.getByRole("alert").filter({ hasText: "Cota diária de IA" })).toContainText("Cota diária de IA compartilhada esgotada.");
  await expect(page.getByRole("region", { name: "Conversa com o Tutor IA" }).getByText("Explique grafos", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Resposta da alternativa autorizada.", { exact: true })).toHaveCount(0);
  expect(requests).toHaveLength(2);
});
