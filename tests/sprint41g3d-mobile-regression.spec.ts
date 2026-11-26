import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const password = "StudyAI2026secure";
const uniqueEmail = (label: string) => `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

async function register(page: Page, email: string) {
  await page.goto("/conta");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome").fill("Conta sintética mobile");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Cadastrar" }).click();
  await expect(page.getByRole("heading", { name: "Conta e sincronização" })).toBeVisible({ timeout: 15_000 });
}

async function login(page: Page, email: string) {
  await page.goto("/conta");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Conta e sincronização" })).toBeVisible({ timeout: 15_000 });
}

async function sync(page: Page) {
  const button = page.getByRole("button", { name: "Sincronizar agora" });
  await expect(button).toBeEnabled({ timeout: 15_000 });
  const response = page.waitForResponse((item) => item.url().endsWith("/sync") && item.request().method() === "POST");
  await button.click();
  expect((await response).ok()).toBe(true);
}

test("viewport mobile: login, navegação, sincronização e troca A → B → A permanecem isolados", async ({ page }) => {
  const emailA = uniqueEmail("mobile-a");
  const emailB = uniqueEmail("mobile-b");
  const markerA = `mobile-private-a-${Date.now()}`;

  await register(page, emailA);
  await page.evaluate((marker) => {
    localStorage.setItem("studyai:workspace:active", JSON.stringify({ marker }));
    localStorage.setItem("studyai-theme", "dark");
  }, markerA);
  await sync(page);

  await Promise.all([
    page.waitForURL(/\/biblioteca$/, { timeout: 15_000 }),
    page.getByRole("navigation", { name: "Navegação rápida" }).getByRole("link", { name: "Biblioteca", exact: true }).click(),
  ]);
  await expect(page.getByRole("heading", { name: "Biblioteca", exact: true })).toBeVisible({ timeout: 15_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.goto("/conta");
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Conta StudyAI" })).toBeVisible();
  await register(page, emailB);
  const accountB = await page.evaluate((marker) => ({
    workspace: localStorage.getItem("studyai:workspace:active"),
    theme: localStorage.getItem("studyai-theme"),
    leaked: Object.values(localStorage).some((value) => value.includes(marker)),
  }), markerA);
  expect(accountB.workspace).toBeNull();
  expect(accountB.theme).toBe("dark");
  expect(accountB.leaked).toBe(false);
  await sync(page);

  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Conta StudyAI" })).toBeVisible();
  await login(page, emailA);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("studyai:workspace:active"))).toBe(JSON.stringify({ marker: markerA }));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Conta e sincronização" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("studyai-theme"))).toBe("dark");
  expect(await page.evaluate((marker) => Object.values(localStorage).some((value) => value.includes(marker)), markerA)).toBe(true);
});
