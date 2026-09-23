import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

test("manifesto PWA declara instalação, ícones adaptativos e compartilhamento", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons).toEqual(expect.arrayContaining([expect.objectContaining({ purpose: "maskable", sizes: "512x512" })]));
  expect(manifest.share_target.action).toBe("/share-target");
  expect(manifest.file_handlers[0].accept["application/pdf"]).toContain(".pdf");
});

test("service worker separa shell, materiais, offline e atualizações", async ({ request }) => {
  const source = await (await request.get("/sw.js")).text();
  expect(source).toContain("studyai-shell-");
  expect(source).toContain("studyai-materials-");
  expect(source).toContain("networkFirst");
  expect(source).toContain("storeSharedFiles");
  expect(source).toContain("SKIP_WAITING");
  expect((await request.get("/offline.html")).ok()).toBe(true);
});

test("configurações da plataforma persistem e expõem diagnóstico de cache", async ({ page }) => {
  await page.goto("/configuracoes");
  await expect(page.getByText("Aplicativo e dispositivo", { exact: true })).toBeVisible();
  await expect(page.getByText(/Navegador/)).toBeVisible();
  const autoDownload = page.getByLabel("Downloads automáticos");
  await autoDownload.check();
  await page.reload();
  await expect(page.getByLabel("Downloads automáticos")).toBeChecked();
  await expect(page.getByRole("button", { name: "Limpar cache" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Verificar atualizações" })).toBeVisible();
});

test("Electron usa isolamento, servidor local e associações de materiais", async () => {
  const main = await readFile(path.join(root, "electron", "main.cjs"), "utf8");
  const preload = await readFile(path.join(root, "electron", "preload.cjs"), "utf8");
  const builder = await readFile(path.join(root, "electron-builder.yml"), "utf8");
  expect(main).toContain("contextIsolation: true");
  expect(main).toContain("nodeIntegration: false");
  expect(main).toContain("127.0.0.1");
  expect(preload).toContain("contextBridge.exposeInMainWorld");
  expect(builder).toContain("target: nsis");
  expect(builder).toContain("fileAssociations");
});

test("Capacitor prepara Android e iOS para arquivos e notificações", async () => {
  const android = await readFile(path.join(root, "android", "app", "src", "main", "AndroidManifest.xml"), "utf8");
  const activity = await readFile(path.join(root, "android", "app", "src", "main", "java", "com", "studyai", "mobile", "MainActivity.java"), "utf8");
  const ios = await readFile(path.join(root, "ios", "App", "App", "Info.plist"), "utf8");
  expect(android).toContain("android.intent.action.SEND_MULTIPLE");
  expect(android).toContain("POST_NOTIFICATIONS");
  expect(activity).toContain("studyaiNativeShare");
  expect(ios).toContain("CFBundleDocumentTypes");
  expect(ios).toContain("com.adobe.pdf");
});
