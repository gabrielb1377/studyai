import { expect, test } from "@playwright/test";
import { createRealStudy } from "./helpers/real-study";
import { readIndexedDBStore } from "./helpers/indexed-db";
import { createTextPdf } from "./helpers/pdf-file";
import { enableAdvancedMode } from "./helpers/experience";

test.beforeEach(async ({ page }) => enableAdvancedMode(page));

test("Workspace 2.0 redimensiona, restaura, troca layouts e registra a sessão", async ({ page }) => {
  const studyId = await createRealStudy(page);
  await page.goto(`/estudo?tema=${studyId}`);

  await expect(page.getByRole("tabpanel", { name: "Material" })).toBeVisible();
  await expect(page.getByRole("tabpanel", { name: "Tutor IA" })).toBeVisible();
  await expect(page.getByText("Ciência da Computação", { exact: true })).toBeVisible();
  const separator = page.getByRole("separator", { name: /Material e Tutor IA/ });
  await separator.focus();
  await separator.press("ArrowRight");
  const storedBeforeRefresh = await page.evaluate((id) => JSON.parse(localStorage.getItem(`studyai:workspace-v2:${id}`) ?? "null"), studyId);
  expect(storedBeforeRefresh.panels[0].size).toBeGreaterThan(65);

  await page.reload();
  const storedAfterRefresh = await page.evaluate((id) => JSON.parse(localStorage.getItem(`studyai:workspace-v2:${id}`) ?? "null"), studyId);
  expect(storedAfterRefresh.panels[0].size).toBe(storedBeforeRefresh.panels[0].size);

  await page.getByLabel("Layout do Workspace").selectOption("review");
  await expect(page.getByRole("tabpanel", { name: "Flashcards" })).toBeVisible();
  await expect(page.getByRole("tabpanel", { name: "Notas" })).toBeVisible();

  await page.getByRole("button", { name: "Salvar layout" }).click();
  await page.getByLabel("Nome do layout").fill("Meu ciclo de revisão");
  await page.getByRole("dialog").getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByLabel("Layout do Workspace")).toHaveValue(/custom-/);

  await page.getByRole("button", { name: "Encerrar sessão de estudo" }).click();
  await expect(page.getByRole("status")).toContainText("Sessão concluída");
  const metadata = await readIndexedDBStore<{ key: string; value: { studyId: string; status: string; tools: string[] } }>(page, "metadata");
  expect(metadata.some((record) => record.key.startsWith("workspace-session:") && record.value.studyId === studyId && record.value.status === "completed")).toBe(true);
});

test("painéis independentes usam lazy rendering e notas Wiki abrem seus destinos", async ({ page }) => {
  const studyId = await createRealStudy(page);
  await page.goto(`/estudo?tema=${studyId}`);

  await page.getByRole("button", { name: "Minimizar Tutor IA" }).click();
  await expect(page.getByLabel("Conversas do Tutor IA")).toHaveCount(0);
  await page.getByRole("button", { name: "Restaurar Tutor IA" }).click();
  await expect(page.getByLabel("Conversas do Tutor IA")).toBeVisible();

  await page.getByRole("tab", { name: "Notas" }).click();
  const notes = page.getByRole("region", { name: "Notas" });
  await notes.getByRole("button", { name: "Nova nota" }).click();
  await notes.getByLabel("Título da nota").fill("Índices conectados");
  await notes.getByRole("button", { name: "Vincular" }).click();
  await page.getByRole("menuitem", { name: "Material · fundamentos.txt" }).click();
  await expect(notes.getByRole("button", { name: "Material · fundamentos.txt" })).toBeVisible();
  await notes.getByRole("button", { name: "Material · fundamentos.txt" }).click();
  await expect(page.getByRole("tabpanel", { name: /fundamentos\.txt|Material/ })).toBeVisible();

  await page.keyboard.press("Control+k");
  await page.getByLabel("Pesquisar páginas").fill("Índices conectados");
  await expect(page.getByText("Índices conectados", { exact: true })).toBeVisible();
  await expect(page.getByText(/Nota ·/).first()).toBeVisible();
});

test("PDF Pro persiste marcações, comentários e histórico", async ({ page }) => {
  await page.goto("/importar");
  await page.getByLabel("Selecionar arquivos do dispositivo").setInputFiles({
    name: "workspace-pro.pdf",
    mimeType: "application/pdf",
    buffer: createTextPdf(["Workspace inteligente", "Anotações persistentes"]),
  });
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Extração concluída" })).toBeVisible();
  const [material] = await readIndexedDBStore<{ id: string; studyId: string }>(page, "documents");
  await page.goto(`/estudo?tema=${material.studyId}&arquivo=${material.id}`);
  await expect(page.getByLabel("Página atual do PDF")).toContainText("Página 1 de 1");

  await page.getByRole("button", { name: "Marca-texto" }).click();
  const pageSurface = page.getByTestId("pdf-annotation-layer");
  await pageSurface.click({ position: { x: 120, y: 120 } });
  await page.getByRole("button", { name: "Adicionar comentário" }).click();
  await page.getByLabel("Texto do comentário").fill("Ponto importante");
  await pageSurface.click({ position: { x: 180, y: 160 } });
  await page.waitForTimeout(250);

  const persisted = await page.evaluate(({ studyId, materialId }) => {
    const state = JSON.parse(localStorage.getItem(`studyai:workspace:${studyId}`) ?? "null");
    return state.pdf[materialId];
  }, { studyId: material.studyId, materialId: material.id });
  expect(persisted.annotations).toHaveLength(2);
  expect(persisted.annotations.map((annotation: { kind: string }) => annotation.kind)).toEqual(["highlight", "comment"]);

  await page.reload();
  await expect(page.getByTitle("Ponto importante")).toBeVisible();
  await expect(page.getByRole("button", { name: "Remover última anotação da página" })).toBeEnabled();
});
