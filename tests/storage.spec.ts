import { expect, test, type Page } from "@playwright/test";
import { readIndexedDBStore } from "./helpers/indexed-db";

async function writeSimulatedDocuments(page: Page, count: number) {
  await page.evaluate(async (total) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("studyai-db", 2);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("documents", "readwrite");
      const store = transaction.objectStore("documents");
      for (let index = 0; index < total; index += 1) {
        store.put({
          id: `simulated-${total}-${index}`,
          fileId: `simulated-${total}-${index}`,
          identity: `material-${index}.pdf:1024:${index}`,
          name: `material-${index}.pdf`,
          relativePath: `material-${index}.pdf`,
          fileType: "pdf",
          mimeType: "application/pdf",
          size: 1024,
          lastModified: index,
          importedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          progress: 100,
          status: "ready",
          isFavorite: false,
        });
      }
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error);
    };
  }), count);
}

test("migra dados pesados do localStorage sem perda e remove apenas as chaves antigas", async ({ page }) => {
  await page.addInitScript(() => {
    const now = new Date().toISOString();
    localStorage.setItem("studyai-theme", "dark");
    localStorage.setItem("studyai:materials", JSON.stringify({
      version: 2,
      materials: [{ id: "legacy-document", fileId: "legacy-document", identity: "legacy.pdf:10:1", name: "legacy.pdf", relativePath: "legacy.pdf", fileType: "pdf", mimeType: "application/pdf", size: 10, lastModified: 1, importedAt: now, updatedAt: now, progress: 100, status: "ready", isFavorite: false }],
    }));
    localStorage.setItem("studyai:notes", JSON.stringify([{ id: "legacy-note", studyId: "legacy-study", title: "Nota preservada", content: "Conteúdo", createdAt: now, updatedAt: now }]));
  });
  await page.goto("/storage");

  await expect(page.getByText("studyai-db", { exact: true })).toBeVisible();
  await expect.poll(async () => (await readIndexedDBStore(page, "documents")).length).toBe(1);
  expect(await readIndexedDBStore(page, "notes")).toHaveLength(1);
  expect(await page.evaluate(() => localStorage.getItem("studyai:materials"))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("studyai:notes"))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("studyai-theme"))).toBe("dark");
});

for (const count of [20, 100]) {
  test(`persiste lote simulado de ${count} PDFs após refresh`, async ({ page }) => {
    await page.goto("/storage");
    await expect(page.getByText("studyai-db", { exact: true })).toBeVisible();
    await writeSimulatedDocuments(page, count);
    await page.reload();
    await expect.poll(async () => (await readIndexedDBStore(page, "documents")).length).toBe(count);
    await expect(page.getByRole("cell", { name: String(count), exact: true }).first()).toBeVisible();
  });
}

test("transação abortada executa rollback sem apagar dados anteriores", async ({ page }) => {
  await page.goto("/storage");
  await expect(page.getByText("studyai-db", { exact: true })).toBeVisible();
  await writeSimulatedDocuments(page, 1);
  await page.evaluate(async () => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("studyai-db", 2);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("documents", "readwrite");
      transaction.objectStore("documents").put({ id: "rollback-document", fileId: "rollback-document", name: "rollback.pdf" });
      transaction.onabort = () => { database.close(); resolve(); };
      transaction.onerror = () => undefined;
      transaction.abort();
    };
  }));

  const documents = await readIndexedDBStore<{ id: string }>(page, "documents");
  expect(documents).toHaveLength(1);
  expect(documents.some((document) => document.id === "rollback-document")).toBe(false);
});
