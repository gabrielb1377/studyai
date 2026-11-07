import { expect, test, type Page } from "@playwright/test";

const password = "StudyAI2026secure";
const uniqueEmail = (label: string) => `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

async function register(page: Page, email: string) {
  await page.goto("/conta");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome").fill("Conta sintética de cache");
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

function privateCacheName(userId: string) {
  return `studyai-private:${userId.replace(/[^a-zA-Z0-9_-]/g, "_")}:runtime`;
}

async function ensureControlledByServiceWorker(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
  });
  await expect.poll(async () => {
    try {
      return await page.evaluate(() => Boolean(navigator.serviceWorker.controller));
    } catch {
      await page.waitForLoadState("domcontentloaded").catch(() => undefined);
      return false;
    }
  }, { timeout: 15_000 }).toBe(true);
}

async function cachedPaths(page: Page) {
  return page.evaluate(async () => {
    const paths: Array<{ cache: string; path: string }> = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        paths.push({ cache: name, path: new URL(request.url).pathname });
      }
    }
    return paths;
  });
}

test("Cache Storage real mantém dados públicos, isola caches privados e nunca reutiliza APIs autenticadas", async ({ page }) => {
  const emailA = uniqueEmail("cache-a");
  const emailB = uniqueEmail("cache-b");
  const markerA = `private-cache-a-${Date.now()}`;
  const markerB = `private-cache-b-${Date.now()}`;

  await register(page, emailA);
  const userA = await currentUserId(page);
  await ensureControlledByServiceWorker(page);
  const cacheA = privateCacheName(userA);
  await page.evaluate(async ({ cacheName, privateMarker }) => {
    const privateCache = await caches.open(cacheName);
    await privateCache.put("/__cache-test__/private-a", new Response(privateMarker));
    const shared = await caches.open("studyai-shared-v1");
    await shared.put("/__cache-test__/public", new Response("public-cache-marker"));
    localStorage.setItem("studyai:workspace:active", JSON.stringify({ marker: privateMarker }));
    await Promise.all([fetch("/auth/session"), fetch("/sync?since=0")]);
  }, { cacheName: cacheA, privateMarker: markerA });

  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Conta StudyAI" })).toBeVisible();
  await register(page, emailB);
  const userB = await currentUserId(page);
  const cacheB = privateCacheName(userB);

  const accountB = await page.evaluate((privateMarker) => ({
    privateValues: Object.values(localStorage).filter((value) => value.includes(privateMarker)),
  }), markerA);
  expect(accountB.privateValues).toEqual([]);

  await page.evaluate(async ({ cacheName, privateMarker, userId }) => {
    const privateCache = await caches.open(cacheName);
    await privateCache.put("/__cache-test__/private-b", new Response(privateMarker));
    localStorage.setItem(`studyai:experience-settings:${userId.replace(/[^a-zA-Z0-9_-]/g, "_")}`, JSON.stringify({ mode: "advanced" }));
    await Promise.all([fetch("/auth/session"), fetch("/sync?since=0")]);
  }, { cacheName: cacheB, privateMarker: markerB, userId: userB });

  const beforeClear = await cachedPaths(page);
  expect(beforeClear.some(({ cache, path }) => cache === cacheA && path === "/__cache-test__/private-a")).toBe(true);
  expect(beforeClear.some(({ cache, path }) => cache === cacheB && path === "/__cache-test__/private-b")).toBe(true);
  expect(beforeClear.some(({ cache, path }) => cache === "studyai-shared-v1" && path === "/__cache-test__/public")).toBe(true);
  expect(beforeClear.some(({ path }) => ["/auth", "/sync", "/profile", "/backup", "/share", "/api/"].some((prefix) => path.startsWith(prefix)))).toBe(false);

  await page.goto("/configuracoes");
  await page.getByRole("button", { name: "Armazenamento", exact: true }).click();
  await page.getByRole("button", { name: "Limpar cache" }).click();
  await expect(page.getByRole("status")).toContainText("1 caches temporários removidos.");
  await expect.poll(() => page.evaluate(async (names) => ({
    a: (await caches.keys()).includes(names.a),
    b: (await caches.keys()).includes(names.b),
    shared: (await caches.keys()).includes("studyai-shared-v1"),
  }), { a: cacheA, b: cacheB })).toEqual({ a: true, b: false, shared: true });

  const publicResponse = await page.evaluate(async () => (await (await caches.open("studyai-shared-v1")).match("/__cache-test__/public"))?.text());
  expect(publicResponse).toBe("public-cache-marker");

  await page.goto("/conta");
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await login(page, emailA);
  await page.evaluate((userId) => {
    localStorage.setItem(`studyai:experience-settings:${userId.replace(/[^a-zA-Z0-9_-]/g, "_")}`, JSON.stringify({ mode: "advanced" }));
  }, userA);
  await page.goto("/configuracoes");
  await page.getByRole("button", { name: "Armazenamento", exact: true }).click();
  await page.getByRole("button", { name: "Limpar cache" }).click();
  await expect(page.getByRole("status")).toContainText("1 caches temporários removidos.");
  await expect.poll(() => page.evaluate(async (name) => (await caches.keys()).includes(name), cacheA)).toBe(false);
  expect(await page.evaluate(async () => Boolean(await (await caches.open("studyai-shared-v1")).match("/__cache-test__/public")))).toBe(true);
});
