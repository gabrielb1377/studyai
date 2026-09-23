import { expect, test, type BrowserContext, type Page } from "@playwright/test";

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
