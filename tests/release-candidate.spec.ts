import { expect, test } from "@playwright/test";
import { enableAdvancedMode } from "./helpers/experience";

test("primeiro acesso mostra landing e permite continuar offline", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.removeItem("studyai:offline-session"));
  await page.reload();
  await expect(page.getByRole("heading", { name: "StudyAI" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Criar conta" })).toBeVisible();
  await page.getByRole("button", { name: "Continuar offline" }).click();
  await expect(page.getByRole("heading", { name: "Que bom ter você por aqui." })).toBeVisible();
});

test("importação pede uma decisão quando o mesmo conteúdo é selecionado novamente", async ({ page }) => {
  await page.goto("/importar");
  const input = page.getByLabel("Selecionar arquivos do dispositivo");
  const file = { name: "duplicado.txt", mimeType: "text/plain", buffer: Buffer.from("conteúdo idêntico para detectar hash") };
  await input.setInputFiles([file, { ...file, name: "renomeado.txt" }]);
  await expect(page.getByRole("dialog").getByText("Materiais duplicados encontrados")).toBeVisible();
  await expect(page.getByRole("button", { name: "Substituir" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ignorar" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Criar cópia" })).toBeVisible();
});

test("modo avançado oferece diagnóstico Beta Ready", async ({ page }) => {
  await enableAdvancedMode(page);
  await page.goto("/configuracoes");
  await page.getByRole("button", { name: "Beta Ready" }).click();
  await expect(page.getByText("Beta Readiness", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Executar diagnóstico" })).toBeVisible();
});
