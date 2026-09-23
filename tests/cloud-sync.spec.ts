import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { readIndexedDBStore } from "./helpers/indexed-db";

const password = "StudyAI2026secure";
const uniqueEmail = (label: string) => `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;

async function register(page: Page, email: string) {
  await page.goto("/conta");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome").fill("Pessoa de Teste");
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

async function putRecord(page: Page, store: string, value: Record<string, unknown>) {
  await page.evaluate(async ({ store, value }) => new Promise<void>((resolve, reject) => {
    const scope = localStorage.getItem("studyai:storage-scope") || "guest";
    const request = indexedDB.open(scope === "guest" ? "studyai-db" : `studyai-db:${scope}`, 2);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction(store, "readwrite");
      transaction.objectStore(store).put(value);
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error);
    };
  }), { store, value });
}

async function note(page: Page, id: string, content: string) {
  const now = new Date().toISOString();
  await putRecord(page, "notes", { id, studyId: "cloud-study", title: "Nota sincronizada", content, createdAt: now, updatedAt: now });
}

async function sync(page: Page) {
  const button=page.getByRole("button", { name: "Sincronizar agora" });
  await expect(button).toBeEnabled({timeout:15_000});
  const response=page.waitForResponse((item)=>item.url().endsWith("/sync")&&item.request().method()==="POST");
  const completed = page.evaluate(() => new Promise<void>((resolve) => {
    const listener = (event: Event) => {
      const status = (event as CustomEvent<{ status?: string }>).detail?.status;
      if (status === "idle" || status === "error" || status === "offline") {
        window.removeEventListener("studyai:cloud-sync", listener);
        resolve();
      }
    };
    window.addEventListener("studyai:cloud-sync", listener);
  }));
  await button.click();
  await Promise.all([response, completed]);
}

async function expectHistory(page:Page,recordId:string){await expect.poll(async()=>{const response=await page.request.get("/sync/history");const data=await response.json() as {history:Array<{recordId:string}>};return data.history.some((item)=>item.recordId===recordId);},{timeout:15_000}).toBe(true);}

test("cadastro, sessão persistente, logout, login e recuperação funcionam", async ({ page }) => {
  const cspViolations: string[] = [];
  page.on("console", (message) => { if (message.type() === "error" && message.text().includes("Content Security Policy")) cspViolations.push(message.text()); });
  const email = uniqueEmail("account");
  await register(page, email);
  await expect(page.getByText(/Modo de desenvolvimento/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Conta e sincronização" })).toBeVisible();

  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Conta StudyAI" })).toBeVisible();
  await login(page, email);
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await page.getByRole("button", { name: "Esqueci a senha" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Enviar instruções" }).click();
  const status = page.getByRole("status");
  await expect(status).toContainText("instruções");
  const token = (await status.textContent())?.match(/Token local:\s*(\S+)/)?.[1];
  expect(token).toBeTruthy();
  await page.goto(`/conta?reset=${encodeURIComponent(token!)}`);
  await page.getByLabel("Nova senha").fill("StudyAI2027secure");
  await page.getByRole("button", { name: "Alterar senha" }).click();
  await expect(page.getByRole("status")).toContainText("Senha alterada");
  expect(cspViolations).toEqual([]);
});

test("sync incremental mantém fila offline, backup, compartilhamento e arquivo", async ({ page, context }) => {
  const email = uniqueEmail("sync");
  await register(page, email);
  await note(page, "cloud-note-1", "Primeira versão real");
  await sync(page);
  await expectHistory(page,"cloud-note-1");

  await context.setOffline(true);
  await note(page, "cloud-note-offline", "Criada sem internet");
  await page.getByRole("button", { name: "Sincronizar agora" }).click();
  await expect(page.getByText("Offline", { exact: true })).toBeVisible();
  await context.setOffline(false);
  await sync(page);
  await expectHistory(page,"cloud-note-offline");

  await page.getByRole("button", { name: "Criar backup agora" }).click();
  await expect(page.getByRole("button", { name: "Restaurar" }).first()).toBeVisible();
  const backupResponse = await page.request.get("/backup");
  const backups = await backupResponse.json() as { backups: Array<{ id: string }> };
  const backupId = backups.backups[0]?.id;
  expect(backupId).toBeTruthy();
  await note(page, "cloud-note-1", "Versão posterior ao backup");
  await sync(page);
  const restoreStatus = await page.evaluate(async (id) => {
    const csrf = document.cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith("studyai_csrf="))?.split("=").slice(1).join("=") ?? "";
    const response = await fetch("/backup", { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": csrf }, body: JSON.stringify({ action: "restore", backupId: id, deviceId: "browser-restore" }) });
    return response.status;
  }, backupId!);
  expect(restoreStatus).toBe(200);
  await sync(page);
  const restoredNotes = await readIndexedDBStore<Array<{ id: string; content: string }>[number]>(page, "notes");
  expect(restoredNotes.find((item) => item.id === "cloud-note-1")?.content).toBe("Primeira versão real");
  await page.getByLabel("ID para compartilhar").fill("cloud-note-1");
  await page.getByRole("button", { name: "Compartilhar", exact: true }).click();
  await expect(page.getByText("notes · cloud-note-1").last()).toBeVisible();

  await putRecord(page, "documents", { id: "cloud-file-1", name: "cloud.txt", extension: "txt", mimeType: "text/plain", type: "text", size: 13, lastModified: Date.now(), status: "ready", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  await page.evaluate(async () => {
    const storage = navigator.storage as StorageManager & { getDirectory(): Promise<FileSystemDirectoryHandle> };
    const root = await storage.getDirectory(); const directory = await root.getDirectoryHandle("studyai-materials", { create: true }); const handle = await directory.getFileHandle("cloud-file-1", { create: true }); const writable = await handle.createWritable(); await writable.write(new File(["conteúdo cloud"], "cloud.txt", { type: "text/plain" })); await writable.close();
  });
  const uploaded = page.waitForResponse((item) => item.url().includes("/api/files/cloud-file-1") && item.request().method() === "PUT");
  await sync(page);
  const uploadResponse = await uploaded;
  expect(uploadResponse.ok(), await uploadResponse.text()).toBe(true);
  const fileResponse = await page.request.get("/api/files/cloud-file-1");
  const downloaded = await fileResponse.text();
  expect(fileResponse.ok(), downloaded).toBe(true);
  expect(downloaded).toBe("conteúdo cloud");
});

test("conflito entre dois dispositivos oferece versão local, remota e mesclagem", async ({ browser }) => {
  const email = uniqueEmail("conflict");
  const first: BrowserContext = await browser.newContext(); const second: BrowserContext = await browser.newContext();
  const firstPage = await first.newPage(); const secondPage = await second.newPage();
  try {
    await register(firstPage, email);
    await note(firstPage, "shared-note", "Base"); await sync(firstPage);
    await login(secondPage, email); await sync(secondPage);
    await note(firstPage, "shared-note", "Alteração do notebook"); await sync(firstPage);
    await note(secondPage, "shared-note", "Alteração do celular");
    await sync(secondPage);
    await expect(secondPage.getByText("Conflitos", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(secondPage.getByRole("button", { name: "Usar esta versão" })).toBeVisible();
    await expect(secondPage.getByRole("button", { name: "Usar versão remota" })).toBeVisible();
    await expect(secondPage.getByRole("button", { name: "Mesclar" })).toBeVisible();
  } finally { await first.close(); await second.close(); }
});

test("exclusão sincronizada remove o documento e o binário OPFS do outro dispositivo", async ({ browser }) => {
  const email = uniqueEmail("delete-device");
  const first: BrowserContext = await browser.newContext();
  const second: BrowserContext = await browser.newContext();
  const firstPage = await first.newPage();
  const secondPage = await second.newPage();
  const materialId = `material-${Date.now()}`;
  try {
    await register(firstPage, email);
    const timestamp = new Date().toISOString();
    await putRecord(firstPage, "documents", {
      id: materialId,
      fileId: materialId,
      name: "material-remoto.txt",
      relativePath: "material-remoto.txt",
      fileType: "txt",
      mimeType: "text/plain",
      size: 17,
      lastModified: Date.now(),
      importedAt: timestamp,
      updatedAt: timestamp,
      status: "ready",
    });
    await firstPage.evaluate(async (id) => {
      const root = await navigator.storage.getDirectory();
      const directory = await root.getDirectoryHandle("studyai-materials", { create: true });
      const handle = await directory.getFileHandle(id, { create: true });
      const writable = await handle.createWritable();
      await writable.write(new File(["conteúdo material"], "material-remoto.txt", { type: "text/plain" }));
      await writable.close();
    }, materialId);
    await sync(firstPage);

    await login(secondPage, email);
    await sync(secondPage);
    await expect.poll(async () => (await secondPage.evaluate(async (id) => {
      const root = await navigator.storage.getDirectory();
      const directory = await root.getDirectoryHandle("studyai-materials", { create: false }).catch(() => null);
      return directory?.getFileHandle(id).then(() => true).catch(() => false) ?? false;
    }, materialId))).toBe(false);
    const remoteFile = await secondPage.request.get(`/api/files/${materialId}`);
    expect(remoteFile.ok()).toBe(true);
    await secondPage.evaluate(async ({ id, bytes }) => {
      const root = await navigator.storage.getDirectory();
      const directory = await root.getDirectoryHandle("studyai-materials", { create: true });
      const handle = await directory.getFileHandle(id, { create: true });
      const writable = await handle.createWritable();
      await writable.write(new Uint8Array(bytes));
      await writable.close();
    }, { id: materialId, bytes: [...new Uint8Array(await remoteFile.body())] });
    const cachedBeforeDelete = await secondPage.evaluate(async (id) => {
      const root = await navigator.storage.getDirectory();
      const directory = await root.getDirectoryHandle("studyai-materials");
      return directory.getFileHandle(id).then(() => true).catch(() => false);
    }, materialId);
    expect(cachedBeforeDelete).toBe(true);

    const csrf = await firstPage.evaluate(() => document.cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith("studyai_csrf="))?.split("=").slice(1).join("=") ?? "");
    const deletedFile = await firstPage.request.delete(`/api/files/${materialId}`, { headers: { "x-csrf-token": csrf } });
    expect(deletedFile.ok()).toBe(true);
    await firstPage.evaluate(async ({ id }) => {
      const scope = localStorage.getItem("studyai:storage-scope") || "guest";
      const request = indexedDB.open(scope === "guest" ? "studyai-db" : `studyai-db:${scope}`, 2);
      const database = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      await new Promise<void>((resolve, reject) => { const transaction = database.transaction("documents", "readwrite"); transaction.objectStore("documents").delete(id); transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
      database.close();
    }, { id: materialId });
    await sync(firstPage);
    await sync(secondPage);
    const cachedAfterDelete = await secondPage.evaluate(async (id) => {
      const root = await navigator.storage.getDirectory();
      const directory = await root.getDirectoryHandle("studyai-materials").catch(() => null);
      return directory?.getFileHandle(id).then(() => true).catch(() => false) ?? false;
    }, materialId);
    expect(cachedAfterDelete).toBe(false);
  } finally {
    await first.close();
    await second.close();
  }
});
