import { expect, test, type Page } from "@playwright/test";

const password = "StudyAI2026secure";
const uniqueEmail = (label: string) => `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

async function register(page: Page, email: string) {
  await page.goto("/conta");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome").fill("Conta sintética");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Cadastrar" }).click();
  await expect(page.getByRole("heading", { name: "Conta e sincronização" })).toBeVisible();
}

async function login(page: Page, email: string) {
  await page.goto("/conta");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Conta e sincronização" })).toBeVisible();
}

async function currentUserId(page: Page) {
  const response = await page.request.get("/auth/session");
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { user: { id: string } }).user.id;
}

async function writeAccountData(page: Page, marker: string) {
  await page.evaluate((value) => {
    localStorage.setItem("studyai:workspace:active", JSON.stringify({ marker: value }));
    localStorage.setItem("studyai:ai-settings", JSON.stringify({ marker: value, provider: "local-test" }));
    localStorage.setItem("studyai:exams", JSON.stringify([{ id: value }]));
  }, marker);
}

async function accountSnapshot(page: Page) {
  return page.evaluate(() => ({
    workspace: localStorage.getItem("studyai:workspace:active"),
    ai: localStorage.getItem("studyai:ai-settings"),
    exams: localStorage.getItem("studyai:exams"),
    theme: localStorage.getItem("studyai-theme"),
    platform: localStorage.getItem("studyai:platform-settings"),
    allValues: Object.values(localStorage),
  }));
}

test("navegador real: A → B → A, múltiplas abas, preferências do dispositivo e API cruzada", async ({ page, context }) => {
  const emailA = uniqueEmail("isolation-a");
  const emailB = uniqueEmail("isolation-b");
  const markerA = `private-a-${Date.now()}`;
  const markerB = `private-b-${Date.now()}`;

  await register(page, emailA);
  const userA = await currentUserId(page);
  await writeAccountData(page, markerA);
  await page.evaluate(() => {
    localStorage.setItem("studyai-theme", "dark");
    localStorage.setItem("studyai:platform-settings", JSON.stringify({ notifications: false }));
  });

  const secondTab = await context.newPage();
  await secondTab.goto("/conta");
  await expect(secondTab.getByRole("heading", { name: "Conta e sincronização" })).toBeVisible();

  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Conta StudyAI" })).toBeVisible();
  await expect(secondTab.getByRole("heading", { name: "Conta StudyAI" })).toBeVisible();

  await register(page, emailB);
  const userB = await currentUserId(page);
  expect(userB).not.toBe(userA);
  await expect(secondTab.getByRole("heading", { name: "Conta e sincronização" })).toBeVisible();

  const snapshotB = await accountSnapshot(page);
  expect(snapshotB.workspace).toBeNull();
  expect(snapshotB.ai).toBeNull();
  expect(snapshotB.exams).toBeNull();
  expect(snapshotB.theme).toBe("dark");
  expect(snapshotB.platform).toBe(JSON.stringify({ notifications: false }));
  expect(snapshotB.allValues.some((value) => value.includes(markerA))).toBe(false);

  const csrf = await page.evaluate(() => document.cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith("studyai_csrf="))?.split("=").slice(1).join("=") ?? "");
  const crossed = await page.request.get("/sync?since=0", { headers: { "x-studyai-session-user": userA, "x-csrf-token": csrf } });
  expect(crossed.status()).toBe(409);

  await writeAccountData(page, markerB);
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Conta StudyAI" })).toBeVisible();
  await login(page, emailA);
  await expect(secondTab.getByRole("heading", { name: "Conta e sincronização" })).toBeVisible();

  await expect.poll(async () => accountSnapshot(page)).toMatchObject({
    workspace: JSON.stringify({ marker: markerA }),
    ai: JSON.stringify({ marker: markerA, provider: "local-test" }),
    exams: JSON.stringify([{ id: markerA }]),
    theme: "dark",
  });
  const restoredA = await accountSnapshot(secondTab);
  expect(restoredA.allValues.some((value) => value.includes(markerB))).toBe(false);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Conta e sincronização" })).toBeVisible();
  const afterReload = await accountSnapshot(page);
  expect(afterReload.workspace).toBe(JSON.stringify({ marker: markerA }));
  expect(afterReload.allValues.some((value) => value.includes(markerB))).toBe(false);
});
