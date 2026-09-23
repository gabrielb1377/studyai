import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

test("Modo Simples reduz a navegação e o Modo Avançado restaura ferramentas técnicas", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Biblioteca", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Diagnóstico", exact: true })).toHaveCount(0);
  await page.goto("/configuracoes");
  await page.getByRole("button", { name: /Modo Avançado/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-experience-mode", "advanced");
  await expect(page.getByRole("link", { name: "Diagnóstico", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: /Modo Avançado/ })).toHaveAttribute("aria-pressed", "true");
});

test("Central de Ajuda encontra tutorial e Ctrl K reúne ações e guias", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Abrir Central de Ajuda" }).click();
  await page.getByPlaceholder("Ex.: Como importar PDF?").fill("importar pdf");
  await page.getByRole("button", { name: /Como importar materiais/ }).click();
  await expect(page.getByText("Arraste arquivos ou escolha uma pasta.")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+k");
  await expect(page.getByText("Ações rápidas", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Pesquisar páginas" }).fill("sincronização");
  await expect(page.getByRole("button", { name: /Sincronização entre dispositivos/ })).toBeVisible();
});

test("onboarding guiado leva uma pessoa nova até a primeira importação", async ({ page }) => {
  await page.goto("/?onboarding=1");
  await expect(page.getByRole("dialog").getByText("Bem-vindo ao StudyAI")).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: /Modo Simples/ }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: /Importar primeiro material/ }).click();
  await expect(page).toHaveURL(/\/importar/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("mobile possui navegação dedicada e interface sem overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/biblioteca");
  const navigation = page.getByRole("navigation", { name: "Navegação rápida" });
  await expect(navigation.getByRole("link", { name: "Biblioteca" })).toHaveAttribute("aria-current", "page");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await navigation.getByRole("link", { name: "Estudo" }).click();
  await expect(page).toHaveURL(/\/estudo/);
});

test("dados locais mudam para um banco isolado ao entrar e voltam ao convidado ao sair", async ({ page }) => {
  await page.goto("/conta");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome").fill("Pessoa Teste");
  await page.getByLabel("Email").fill(`isolamento-${Date.now()}@studyai.local`);
  await page.getByLabel("Senha").fill("SenhaSegura123");
  await page.getByRole("button", { name: "Cadastrar" }).click();
  await expect(page.getByRole("heading", { name: "Conta e sincronização" })).toBeVisible();
  const accountScope = await page.evaluate(() => localStorage.getItem("studyai:storage-scope"));
  expect(accountScope).toMatch(/^user-/);
  const databases = await page.evaluate(async () => (await indexedDB.databases()).map((database) => database.name));
  expect(databases).toContain(`studyai-db:${accountScope}`);
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("studyai:storage-scope"))).toBe("guest");
});

test("produção possui Object Storage, HTTPS, containers e entrega contínua", async ({ request }) => {
  const [objectStorage, compose, dockerfile, caddy, workflow] = await Promise.all([
    readFile(path.join(root, "src", "server", "storage", "ObjectStorage.ts"), "utf8"),
    readFile(path.join(root, "docker-compose.yml"), "utf8"),
    readFile(path.join(root, "Dockerfile"), "utf8"),
    readFile(path.join(root, "deploy", "Caddyfile"), "utf8"),
    readFile(path.join(root, ".github", "workflows", "deploy.yml"), "utf8"),
  ]);
  expect(objectStorage).toContain("users/${safeSegment(userId)}/materials");
  expect(compose).toContain("minio:");
  expect(compose).toContain("postgres:");
  expect(dockerfile).toContain("HEALTHCHECK");
  expect(caddy).toContain("encode zstd gzip");
  expect(workflow).toContain("docker/build-push-action");
  const health = await request.get("/api/health");
  expect(health.ok()).toBe(true);
  await expect(health.json()).resolves.toEqual(expect.objectContaining({ status: "ok", objectStorage: expect.objectContaining({ mode: "database" }) }));
});

test("endpoint de telemetria rejeita corpos grandes e JSON inválido", async ({ request }) => {
  const tooLarge = await request.post("/api/telemetry", {
    headers: { "content-type": "application/json", "x-device-id": "id-rotativo" },
    data: JSON.stringify({ name: "LCP", value: 1, padding: "x".repeat(5_000) }),
  });
  expect(tooLarge.status()).toBe(413);

  const invalid = await request.post("/api/telemetry", {
    headers: { "content-type": "application/json", "x-device-id": "outro-id" },
    data: "{invalid-json",
  });
  expect(invalid.status()).toBe(400);
});
