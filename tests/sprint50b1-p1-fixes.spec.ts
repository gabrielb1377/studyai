import { expect, test } from "@playwright/test";
import { STORAGE_DATABASE_VERSION } from "../src/lib/storage/StorageVersion";
import { importTextMaterial } from "./helpers/real-study";

test("P1-A: links do Dashboard para Estudo abrem o estudo correspondente mesmo quando outro estudo foi acessado mais recentemente", async ({ page }) => {
  await importTextMaterial(page, "fixture.txt", "Material sintético para inicializar o armazenamento.");
  await page.goto("/");
  await page.waitForFunction(async () => {
    const scope = localStorage.getItem("studyai:storage-scope") || "guest";
    const name = scope === "guest" ? "studyai-db" : `studyai-db:${scope}`;
    return (await indexedDB.databases()).some((db) => db.name === name);
  });
  await page.evaluate(async (version) => {
    const scope = localStorage.getItem("studyai:storage-scope") || "guest";
    const databaseName = scope === "guest" ? "studyai-db" : `studyai-db:${scope}`;
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName, version);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const oldDate = "2026-10-01T10:00:00.000Z";
    const recentDate = "2026-11-12T10:00:00.000Z";

    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(["studies", "knowledge"], "readwrite");
      tx.objectStore("studies").put({
        studyId: "study-alpha",
        title: "Álgebra Linear",
        subject: "Matemática",
        materialIds: [],
        status: "in_progress",
        progress: 20,
        createdAt: oldDate,
        updatedAt: oldDate,
        lastAccessedAt: oldDate,
        _storageOrder: 0,
      });
      tx.objectStore("studies").put({
        studyId: "study-beta",
        title: "Cálculo Vetorial",
        subject: "Matemática",
        materialIds: [],
        status: "in_progress",
        progress: 85,
        createdAt: recentDate,
        updatedAt: recentDate,
        lastAccessedAt: recentDate,
        _storageOrder: 1,
      });
      tx.objectStore("knowledge").put({
        id: "graph-alpha",
        version: 1, parserVersion: "test", extractedContentId: "content-alpha", documentName: "fixture.txt", sourceHash: "synthetic", blocks: [],
        studyId: "study-alpha",
        fileId: "file-alpha",
        concepts: [
          { id: "c-matrizes", studyId: "study-alpha", fileId: "file-alpha", name: "Matrizes", normalizedName: "matrizes", description: "Arranjos retangulares.", kind: "concept", importance: 80, aliases: [], keywords: ["matrizes"], relationIds: ["rel-1"], examples: [], observations: [], document: "fixture.txt" },
          { id: "c-autovalores", studyId: "study-alpha", fileId: "file-alpha", name: "Autovalores", normalizedName: "autovalores", description: "Valores próprios.", kind: "concept", importance: 90, aliases: [], keywords: ["autovalores"], relationIds: ["rel-1"], examples: [], observations: [], document: "fixture.txt" },
        ],
        relations: [
          { id: "rel-1", studyId: "study-alpha", sourceId: "c-autovalores", targetId: "c-matrizes", kind: "depends_on", weight: 0.9, evidence: "Autovalores dependem de Matrizes." },
        ],
        chunks: [],
        statistics: { conceptCount: 2, relationCount: 1, isolatedConceptCount: 0, chapterCount: 0, semanticChunkCount: 0, structureDegree: 100 },
        createdAt: oldDate,
        updatedAt: oldDate,
        _storageOrder: 0,
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    database.close();
  }, STORAGE_DATABASE_VERSION);

  await page.goto("/estudo?tema=study-beta");
  await expect(page.getByRole("heading", { name: "Cálculo Vetorial", exact: true })).toBeVisible();
  await page.goto("/");

  const alphaLink = page.locator('a[href*="study-alpha"]').filter({ hasText: "Abrir" }).first();
  await expect(alphaLink).toBeVisible();
  await expect(alphaLink).toHaveAttribute("href", "/estudo?tema=study-alpha");
  await alphaLink.click();
  await expect(page).toHaveURL(/\/estudo\?tema=study-alpha/);

  await expect(page.getByRole("heading", { name: "Álgebra Linear", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cálculo Vetorial", exact: true })).toHaveCount(0);

  await page.goto("/");
  const prereqLink = page.getByRole("link", { name: /Matrizes/ });
  await expect(prereqLink).toHaveAttribute("href", "/estudo?tema=study-alpha&aba=knowledge");
  await Promise.all([
    page.waitForURL(/\/estudo\?tema=study-alpha&aba=knowledge$/),
    prereqLink.click(),
  ]);

  await expect(page.getByRole("heading", { name: "Álgebra Linear", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mapa de Conhecimento" })).toBeVisible();

  await page.goto("/estudo?tema=study-alpha");
  await expect(page.getByRole("heading", { name: "Álgebra Linear", exact: true })).toBeVisible();
});

test("P1-B: botão Detalhes expande e recolhe metadados detalhados de forma acessível nos modos grade e lista", async ({ page }) => {
  await importTextMaterial(page, "apostila-detalhes.txt", "Estruturas de dados e algoritmos fundamentais para computação.");
  await page.goto("/biblioteca");

  const card = page.getByRole("article", { name: "apostila-detalhes.txt" });
  await expect(card).toBeVisible();

  const detailsButton = card.getByRole("button", { name: "Detalhes", exact: true });
  await expect(detailsButton).toHaveAttribute("aria-expanded", "false");
  await expect(card.getByText("Disciplina", { exact: true })).toBeVisible();
  await expect(card.getByText("Tema", { exact: true })).toBeVisible();
  await expect(card.getByText("Tamanho", { exact: true })).toBeHidden();
  await expect(card.getByText("Professor", { exact: true })).toBeHidden();

  await detailsButton.focus();
  await page.keyboard.press("Enter");
  await expect(detailsButton).toHaveAttribute("aria-expanded", "true");
  await expect(card.getByText("Tamanho", { exact: true })).toBeVisible();
  await expect(card.getByText("Professor", { exact: true })).toBeVisible();
  await expect(card.getByText("Palavras", { exact: false }).first()).toBeVisible();

  await page.keyboard.press("Space");
  await expect(detailsButton).toHaveAttribute("aria-expanded", "false");
  await expect(card.getByText("Tamanho", { exact: true })).toBeHidden();
  await expect(card.getByText("Professor", { exact: true })).toBeHidden();

  await page.getByRole("button", { name: "Visualização Lista" }).click();
  await expect(detailsButton).toHaveAttribute("aria-expanded", "false");
  await expect(card.getByText("Tamanho", { exact: true })).toBeHidden();

  await detailsButton.focus();
  await page.keyboard.press("Enter");
  await expect(detailsButton).toHaveAttribute("aria-expanded", "true");
  await expect(card.getByText("Tamanho", { exact: true })).toBeVisible();
  await expect(card.getByText("Disciplina", { exact: true })).toBeVisible();

  await detailsButton.click();
  await expect(detailsButton).toHaveAttribute("aria-expanded", "false");
  await expect(card.getByText("Tamanho", { exact: true })).toBeHidden();
});
