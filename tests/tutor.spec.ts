import { expect, test } from "@playwright/test";

import { createRealStudy } from "./helpers/real-study";
import { readIndexedDBStore } from "./helpers/indexed-db";

test("Tutor inicia sem mensagens e persiste conversas criadas pelo usuário", async ({ page }) => {
  const requests: Array<{ history: unknown[]; message: string; context?: unknown; provider?: string }> = [];
  await page.route("**/api/tutor", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ model: "gemini-3.7-flash", text: "Resposta do provedor durante o teste." }),
    });
  });
  await page.goto("/tutor");
  await expect(page.getByText("Crie uma conversa para começar.")).toBeVisible();
  await page.getByRole("button", { name: "Nova conversa" }).first().click();
  await expect(page.getByText("Conversa vazia")).toBeVisible();
  await page.getByLabel("Mensagem para o Tutor IA").fill("Explique estruturas de dados");
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByRole("region", { name: "Conversa com o Tutor IA" }).getByText("Resposta do provedor durante o teste.", { exact: true })).toBeVisible();
  expect(requests[0]).toMatchObject({ history: [], message: "Explique estruturas de dados", provider: "gemini" });
  expect(requests[0].context).toBeUndefined();

  await page.reload();
  await expect(page.getByText("Explique estruturas de dados", { exact: true })).toBeVisible();
  const metadata = await readIndexedDBStore<{ key: string; value: unknown[] }>(page, "metadata");
  expect(metadata.find((item) => item.key === "tutor-conversations")?.value).toHaveLength(1);
});

test("Tutor usa o estudo atual, os chunks extraídos e o histórico real", async ({ page }) => {
  const requests: Array<{
    history: unknown[];
    context?: { studyId: string };
    chunks?: Array<{ text: string; studyId: string }>;
  }> = [];
  await page.route("**/api/tutor", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ model: "gemini-3.7-flash", text: "Resposta baseada no material importado." }),
    });
  });
  const studyId = await createRealStudy(page);
  await page.goto("/tutor");
  await expect(page.getByText("Utilizando contexto do tema atual")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Contexto identificado do documento" })).toBeVisible();
  await page.getByRole("button", { name: "Nova conversa" }).first().click();
  await page.getByLabel("Mensagem para o Tutor IA").fill("Como os vetores armazenam elementos?");
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByRole("region", { name: "Conversa com o Tutor IA" })
    .getByText("Resposta baseada no material importado.", { exact: true })).toBeVisible();

  expect(requests[0].context?.studyId).toBe(studyId);
  expect(requests[0].chunks?.length).toBeGreaterThan(0);
  expect(requests[0].chunks?.[0].studyId).toBe(studyId);
  expect(requests[0].chunks?.[0].text).toContain("Vetores armazenam elementos");
});

test("resumo utiliza conteúdo extraído e fica relacionado ao estudo", async ({ page }) => {
  const requests: Array<{ context: { studyId: string }; chunks: Array<{ text: string }> }> = [];
  await page.route("**/api/tutor/summary", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ model: "gemini-3.7-flash", text: "Vetores usam índices para localizar elementos." }),
    });
  });
  const studyId = await createRealStudy(page);
  await page.goto("/tutor");
  await page.getByRole("button", { name: "Nova conversa" }).first().click();
  await page.getByRole("button", { name: "Gerar resumo" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Vetores usam índices", { exact: false })).toBeVisible();
  expect(requests[0].context.studyId).toBe(studyId);
  expect(requests[0].chunks[0].text).toContain("Vetores armazenam elementos");
  await expect(dialog.getByText("Salvo automaticamente", { exact: true })).toBeVisible();

  const summaries = await readIndexedDBStore<Array<{ studyId: string }>[number]>(page, "summaries");
  expect(summaries[0].studyId).toBe(studyId);
});

test("Tutor mantém a pergunta quando o provedor retorna erro", async ({ page }) => {
  await page.route("**/api/tutor", (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ error: "Configure GEMINI_API_KEY em .env.local para utilizar o Tutor IA." }),
  }));
  await page.goto("/tutor");
  await page.getByRole("button", { name: "Nova conversa" }).first().click();
  await page.getByLabel("Mensagem para o Tutor IA").fill("Explique recursão");
  await page.getByRole("button", { name: "Enviar" }).click();

  await expect(
    page.getByRole("alert").filter({ hasText: "Configure GEMINI_API_KEY em .env.local" }),
  ).toContainText("Configure GEMINI_API_KEY em .env.local para utilizar o Tutor IA.");
  await expect(page.getByRole("region", { name: "Conversa com o Tutor IA" }).getByText("Explique recursão", { exact: true })).toBeVisible();
});

test("Tutor permanece responsivo no celular sem conversas pré-carregadas", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto("/tutor");
  await expect(page.getByRole("button", { name: "Nova conversa" }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
