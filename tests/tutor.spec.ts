import { expect, test } from "@playwright/test";

test("Tutor IA apresenta conversas e interface mockada", async ({ page }) => {
  await page.goto("/tutor");

  await expect(page.getByRole("heading", { name: "Tutor IA", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Tutor IA", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Vetores e matrizes" })).toBeVisible();
  await expect(page.getByText("Vetores armazenam dados em sequência.", { exact: true })).toBeVisible();
  await expect(page.getByText("int[] notas = {8, 9, 7};", { exact: false })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();

  await page.getByLabel("Pesquisar conversa").fill("Java");
  await expect(page.getByRole("button", { name: /Java Classes e objetos/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Algoritmos Vetores e matrizes/ })).toHaveCount(0);
  await page.getByLabel("Pesquisar conversa").fill("");

  await page.getByRole("button", { name: "Explicar" }).click();
  await expect(page.getByLabel("Mensagem para o Tutor IA")).toHaveValue("Explicar este tema");
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByText("Resposta simulada", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Anexar arquivo (em breve)" })).toBeVisible();

  await page.getByRole("button", { name: "Nova conversa" }).click();
  await expect(page.getByRole("heading", { name: "Nova conversa" })).toBeVisible();
  await expect(page.getByText("Nova conversa iniciada.", { exact: false })).toBeVisible();
});

test("Tutor IA permanece responsivo no celular", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto("/tutor");

  await expect(page.getByRole("button", { name: "Nova conversa" })).toBeVisible();
  await expect(page.getByLabel("Mensagem para o Tutor IA")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/tutor-mobile.png", fullPage: true });
});
