import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("Central de Ajuda oferece feedback e relato de problema acessíveis", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Abrir Central de Ajuda" }).click();
  await page.getByRole("button", { name: "Enviar feedback" }).click();
  await expect(page.getByRole("dialog").getByText("Enviar feedback da Beta")).toBeVisible();
  await expect(page.getByRole("button", { name: "1 de 5 para Experiência geral" })).toBeVisible();
  await page.getByRole("button", { name: "Enviar relato" }).click();
  await expect(page.getByRole("alert")).toContainText("pelo menos 10 caracteres");
  await page.getByRole("button", { name: "Cancelar" }).click();

  await page.getByRole("button", { name: "Abrir Central de Ajuda" }).click();
  await page.getByRole("button", { name: "Reportar problema" }).click();
  await expect(page.getByRole("dialog").getByText("Reportar um problema")).toBeVisible();
  await expect(page.getByText("Incluir diagnóstico seguro")).toBeVisible();
  await expect(page.getByText(/Conteúdo de estudo, arquivos e credenciais nunca/)).toBeVisible();
});

test("API de feedback valida tipo, conteúdo e limite do relato", async ({ request }) => {
  const empty = await request.post("/api/feedback", { headers: { "content-type": "application/json" }, data: "null" });
  expect(empty.status()).toBe(400);

  const invalid = await request.post("/api/feedback", { data: { kind: "unknown", description: "descrição suficientemente longa" } });
  expect(invalid.status()).toBe(400);

  const short = await request.post("/api/feedback", { data: { kind: "issue", description: "curto" } });
  expect(short.status()).toBe(400);

  const tooLarge = await request.post("/api/feedback", {
    headers: { "content-type": "application/json" },
    data: JSON.stringify({ kind: "issue", description: "x".repeat(25_000) }),
  });
  expect(tooLarge.status()).toBe(413);
});

test("backup v2 exporta e restaura o estado permitido do Workspace", async ({ page }) => {
  await page.goto("/conta");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome").fill("Pessoa Backup");
  await page.getByLabel("Email").fill(`backup-${Date.now()}@studyai.local`);
  await page.getByLabel("Senha").fill("SenhaSegura123");
  await page.getByRole("button", { name: "Cadastrar" }).click();
  await expect(page.getByRole("heading", { name: "Conta e sincronização" })).toBeVisible();

  const key = "studyai:workspace-v2:beta-test";
  const original = JSON.stringify({ version: 2, studyId: "beta-test", panels: [] });
  await page.evaluate(({ key, original }) => localStorage.setItem(key, original), { key, original });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar dados" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error("O backup não foi disponibilizado pelo navegador.");
  const archive = JSON.parse(await readFile(downloadPath, "utf8")) as { version: number; preferences: Record<string, string> };
  expect(archive.version).toBe(2);
  expect(archive.preferences[key]).toBe(original);

  await page.evaluate((storageKey) => localStorage.setItem(storageKey, "alterado"), key);
  await page.locator('input[type="file"][accept*="json"]').setInputFiles({
    name: "studyai-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(archive)),
  });
  await expect(page.getByText(/^Backup importado\./)).toBeVisible();
  await expect.poll(() => page.evaluate((storageKey) => localStorage.getItem(storageKey), key)).toBe(original);
});
