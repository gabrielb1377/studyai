import { expect, test } from "@playwright/test";

import { createRealStudy } from "./helpers/real-study";
import { readIndexedDBStore } from "./helpers/indexed-db";

test("workspace abre o estudo e o material realmente importado", async ({ page }) => {
  const studyId = await createRealStudy(page);
  await page.goto(`/estudo?tema=${studyId}`);

  await expect(page.getByRole("heading", { name: "Estruturas de dados", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Algoritmos");
  await expect(page.getByRole("button", { name: /fundamentos\.txt/ })).toBeVisible();
  await expect(page.getByRole("tabpanel", { name: "Material" }).getByText("Vetores armazenam elementos", { exact: false })).toBeVisible();

  await page.getByRole("tab", { name: "IA", exact: true }).click();
  await expect(page.getByText("Crie uma conversa para começar.")).toBeVisible();
  await page.getByRole("tab", { name: "Flashcards" }).click();
  await expect(page.getByRole("heading", { name: "Flashcards" })).toBeVisible();
  await page.getByRole("tab", { name: "Quiz" }).click();
  await expect(page.getByRole("heading", { name: "Quiz" })).toBeVisible();
  await page.getByRole("tab", { name: "Notas" }).click();
  await expect(page.getByRole("heading", { name: "Notas" })).toBeVisible();
});

test("Study Engine persiste progresso sem criar temas artificiais", async ({ page }) => {
  const studyId = await createRealStudy(page);
  await page.goto(`/estudo?tema=${studyId}`);
  await page.getByLabel("Status do estudo").selectOption("completed");
  await expect(page.getByLabel("Progresso do estudo")).toHaveValue("100");

  const records = await readIndexedDBStore<Array<Record<string, unknown>>[number]>(page, "studies");
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({ title: "Estruturas de dados", subject: "Algoritmos", status: "completed", progress: 100 });

  await page.goto("/");
  await expect(page.getByText("100% concluído", { exact: true })).toBeVisible();
  await expect(page.locator("#continue-title")).toHaveText("Estruturas de dados");
});

test("flashcards e quiz recebem chunks reais do estudo", async ({ page }) => {
  const flashcardRequests: Array<{ chunks?: Array<{ text: string }> }> = [];
  const quizRequests: Array<{ chunks?: Array<{ text: string }> }> = [];
  await page.route("**/api/tutor/flashcards", async (route) => {
    flashcardRequests.push(route.request().postDataJSON());
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ cards: [{ question: "Como vetores armazenam elementos?", answer: "Em posições identificadas por índices.", difficulty: "easy" }] }) });
  });
  await page.route("**/api/tutor/quiz", async (route) => {
    quizRequests.push(route.request().postDataJSON());
    const questions = Array.from({ length: 5 }, (_, index) => ({ question: `Questão ${index + 1}`, alternatives: ["Por índices", "Sem ordem", "Somente texto", "Sem posição"], correctAnswer: 0, explanation: "O material informa que os elementos possuem índices.", difficulty: "easy" }));
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ questions }) });
  });
  const studyId = await createRealStudy(page);
  await page.goto(`/estudo?tema=${studyId}`);
  await page.getByRole("tab", { name: "Flashcards" }).click();
  const flashcards = page.getByRole("region", { name: "Flashcards" });
  await flashcards.getByRole("button", { name: "Criar flashcards" }).click();
  await expect(flashcards.getByText("Como vetores armazenam elementos?", { exact: true })).toBeVisible();
  expect(flashcardRequests[0]?.chunks?.[0]?.text).toContain("Vetores armazenam elementos");

  await page.getByRole("tab", { name: "Quiz" }).click();
  const quiz = page.getByRole("region", { name: "Quiz" });
  await quiz.getByRole("button", { name: "Criar quiz" }).click();
  await expect(quiz.getByText("Questão 1", { exact: true })).toBeVisible();
  expect(quizRequests[0]?.chunks?.[0]?.text).toContain("Vetores armazenam elementos");
});

test("notas são vinculadas automaticamente ao estudo aberto", async ({ page }) => {
  const studyId = await createRealStudy(page);
  await page.goto(`/estudo?tema=${studyId}`);
  await page.getByRole("tab", { name: "Notas" }).click();
  const workspace = page.getByRole("region", { name: "Notas" });
  await workspace.getByRole("button", { name: "Nova nota" }).click();
  await workspace.getByLabel("Título da nota").fill("Índices");
  await workspace.getByLabel("Conteúdo da nota").fill("O primeiro índice é zero.");
  await expect(workspace.getByText("Salvo automaticamente", { exact: true })).toBeVisible();
  await page.waitForTimeout(600);

  const notes = await readIndexedDBStore<Array<Record<string, unknown>>[number]>(page, "notes");
  expect(notes[0]).toMatchObject({ studyId, title: "Índices" });
});

test("workspace real permanece responsivo no celular", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  const studyId = await createRealStudy(page);
  await page.goto(`/estudo?tema=${studyId}`);
  await expect(page.getByRole("tab", { name: "Material" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
