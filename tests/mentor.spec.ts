import { expect, test } from "@playwright/test";
import { createRealStudy } from "./helpers/real-study";
import { readIndexedDBStore } from "./helpers/indexed-db";

test("Mentor conduz sessão socrática, corrige e persiste o histórico", async ({ page }) => {
  const studyId = await createRealStudy(page);
  await page.goto(`/estudo?tema=${studyId}`);
  await page.getByRole("tab", { name: "Mentor" }).click();

  await expect(page.getByLabel("Mentor Inteligente")).toBeVisible();
  await expect(page.getByLabel("Escolher tema para o Mentor")).toHaveValue(studyId);
  await page.getByRole("button", { name: "Iniciar Sessão" }).click();
  await expect(page.getByRole("region", { name: "Sessão guiada" })).toBeVisible();
  await expect(page.getByText("Pergunta do Mentor")).toBeVisible();

  await page.getByLabel("Sua resposta ao Mentor").fill("Não sei responder ainda.");
  await page.getByRole("button", { name: "Responder" }).click();
  await expect(page.getByRole("status")).toContainText(/Ainda não|Parcialmente correto/);
  await expect(page.getByText("Onde revisar")).toBeVisible();
  await page.getByRole("button", { name: "Explicar novamente" }).click();
  await expect(page.getByText(/Estruturas de dados|Conceito central/).last()).toBeVisible();

  await page.getByRole("button", { name: "Concluir sessão" }).click();
  await expect(page.getByText("Memória das sessões")).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "Mentor" }).click();
  await expect(page.getByText("Memória das sessões")).toBeVisible();

  const metadata = await readIndexedDBStore<{ key: string; value?: { sessions?: Array<{ studyId: string; status: string }> } }>(page, "metadata");
  const mentor = metadata.find((record) => record.key === "mentor:v1");
  expect(mentor?.value?.sessions?.some((session) => session.studyId === studyId && session.status === "completed")).toBe(true);
});

test("metas e recomendações do Mentor usam e preservam dados reais", async ({ page }) => {
  const studyId = await createRealStudy(page);
  await page.goto(`/estudo?tema=${studyId}`);
  await page.getByRole("tab", { name: "Mentor" }).click();
  await page.getByLabel("Nova meta").fill("Revisar antes da prova");
  await page.getByLabel("Tipo da meta").selectOption("exam");
  await page.getByRole("button", { name: "Adicionar" }).click();
  await expect(page.getByText("Revisar antes da prova", { exact: true })).toBeVisible();
  await expect(page.getByText("Praticar com um quiz", { exact: true })).toBeVisible();

  await page.reload();
  await page.getByRole("tab", { name: "Mentor" }).click();
  await expect(page.getByText("Revisar antes da prova", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Concluir meta Revisar antes da prova" }).click();
  await expect(page.getByText(/Prova · 100%/)).toBeVisible();
});
