import { expect, test } from "@playwright/test";

test("workspace de estudo apresenta abas e interações mockadas", async ({ page }) => {
  await page.goto("/estudo?tema=vetores");

  await expect(
    page.getByRole("heading", { name: "Vetores e matrizes", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText(
    "Algoritmos",
  );
  await expect(page.getByRole("tab", { name: "Material" })).toHaveAttribute(
    "data-state",
    "active",
  );
  await expect(page.getByText("Introdução aos vetores.pdf", { exact: true })).toBeVisible();
  await expect(page.getByText("PDF", { exact: true })).toBeVisible();
  await expect(page.getByText("2,4 MB", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Abrir material" }).first().click();
  await expect(page.getByRole("status")).toContainText("disponível em breve");

  await page.getByRole("tab", { name: "IA", exact: true }).click();
  await expect(page.getByText("Tutor de estudo", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Explicar" }).click();
  await expect(page.getByLabel("Mensagem para o tutor")).toHaveValue(/Explicar/);
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByText("Resposta simulada", { exact: false })).toBeVisible();

  await page.getByRole("tab", { name: "Estudar" }).click();
  await expect(page.getByRole("heading", { name: "Flashcards" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Quiz" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Notas" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Abrir", exact: true })).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Abrir", exact: true }).first()).toBeDisabled();

  await page.getByRole("link", { name: "Voltar" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("workspace de estudo permanece responsivo no celular", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto("/estudo?tema=vetores");

  await expect(page.getByRole("tab", { name: "Material" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/study-mobile.png",
    fullPage: true,
  });
});
