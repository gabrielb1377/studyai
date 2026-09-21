import { expect, test, type Page } from "@playwright/test";

import { createRealStudy } from "./helpers/real-study";
import { readIndexedDBStore } from "./helpers/indexed-db";

const checkedAt = "2026-09-16T12:00:00.000Z";

async function importFolderMaterials(page: Page) {
  await page.goto("/importar");
  await page.getByRole("region", { name: "Arraste seus materiais para cá" }).evaluate((element) => {
    const transfer = new DataTransfer();
    const files = [
      new File(["Vetores possuem índices e armazenam dados."], "vetores.txt", { type: "text/plain", lastModified: 1 }),
      new File(["Consultas SQL recuperam registros de tabelas."], "sql.txt", { type: "text/plain", lastModified: 2 }),
    ];
    Object.defineProperty(files[0], "webkitRelativePath", { value: "Algoritmos/Vetores/vetores.txt" });
    Object.defineProperty(files[1], "webkitRelativePath", { value: "Banco de Dados/SQL/sql.txt" });
    files.forEach((file) => transfer.items.add(file));
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: transfer });
    element.dispatchEvent(event);
  });
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await expect(page.getByText("Extraído", { exact: true })).toHaveCount(2);
}

test("diagnóstico testa providers online e offline individualmente", async ({ page }) => {
  const providers = [
    { provider: "gemini", available: true, latencyMs: 42, averageResponseTimeMs: 65, models: [{ name: "gemini-test" }], endpoint: "https://gemini.test", checkedAt },
    { provider: "ollama", available: false, latencyMs: 5, models: [], endpoint: "http://localhost:11434", error: "Ollama indisponível", lastError: "Ollama indisponível", checkedAt },
    { provider: "groq", available: false, latencyMs: 0, models: [], endpoint: "https://api.groq.com/openai/v1", error: "GROQ_API_KEY não configurada.", checkedAt },
    { provider: "openrouter", available: false, latencyMs: 0, models: [], endpoint: "https://openrouter.ai/api/v1", error: "OPENROUTER_API_KEY não configurada.", checkedAt },
  ];
  await page.route("**/api/ai/manager*", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ providers, statistics: { messages: 0, averageResponseTimeMs: 0, failures: 0, fallbacks: 0 }, logs: [] }),
  }));
  await page.route("**/api/ai/providers/gemini*", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(providers[0]) }));
  await page.goto("/configuracoes");
  await expect(page.getByRole("region", { name: "Status dos providers" })).toContainText("https://gemini.test");
  await expect(page.getByRole("region", { name: "Status dos providers" })).toContainText("Ollama indisponível");
  await page.getByRole("button", { name: "Testar conexão" }).first().click();
  await expect(page.getByText("42 ms", { exact: true }).first()).toBeVisible();
});

test("workspace restaura aba e nota aberta após refresh e reabertura", async ({ page }) => {
  const studyId = await createRealStudy(page);
  await page.goto(`/estudo?tema=${studyId}`);
  await page.getByRole("tab", { name: "Notas" }).click();
  await page.getByRole("region", { name: "Notas" }).getByRole("button", { name: "Nova nota" }).click();
  await page.getByLabel("Título da nota").fill("Persistência");
  await page.getByLabel("Conteúdo da nota").fill("Conteúdo salvo automaticamente.");
  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.getByRole("tab", { name: "Notas" })).toHaveAttribute("data-state", "active");
  await expect(page.getByLabel("Título da nota")).toHaveValue("Persistência");

  const reopened = await page.context().newPage();
  await reopened.goto(`/estudo?tema=${studyId}`);
  await expect(reopened.getByRole("tab", { name: "Notas" })).toHaveAttribute("data-state", "active");
  await expect(reopened.getByLabel("Conteúdo da nota")).toHaveValue("Conteúdo salvo automaticamente.");
  const notes = await readIndexedDBStore<Array<{ title: string }>[number]>(reopened, "notes");
  expect(notes[0].title).toBe("Persistência");
});

test("restaura flashcard e questão atuais", async ({ page }) => {
  await page.route("**/api/tutor/flashcards", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ cards: [
      { question: "Cartão 1", answer: "Resposta 1", difficulty: "easy" },
      { question: "Cartão 2", answer: "Resposta 2", difficulty: "medium" },
    ] }),
  }));
  await page.route("**/api/tutor/quiz", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ questions: Array.from({ length: 5 }, (_, index) => ({
      question: `Questão persistida ${index + 1}`,
      alternatives: ["A", "B", "C", "D"],
      correctAnswer: 0,
      explanation: "Explicação",
      difficulty: "easy",
    })) }),
  }));
  const studyId = await createRealStudy(page);
  await page.goto(`/estudo?tema=${studyId}`);
  await page.getByRole("tab", { name: "Flashcards" }).click();
  await page.getByRole("button", { name: "Criar flashcards" }).click();
  await expect(page.getByText("Cartão 1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Próximo" }).click();
  await expect(page.getByText("Cartão 2", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Quiz" }).click();
  await page.getByRole("button", { name: "Criar quiz" }).click();
  await page.getByRole("button", { name: "A. A" }).click();
  await page.getByRole("button", { name: "Próxima" }).click();
  await expect(page.getByText("Questão persistida 2", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("tab", { name: "Quiz" })).toHaveAttribute("data-state", "active");
  await expect(page.getByText("Questão persistida 2", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Flashcards" }).click();
  await expect(page.getByText("Cartão 2", { exact: true })).toBeVisible();
});

test("sidebar troca matéria e tema e ação Abrir seleciona o arquivo", async ({ page }) => {
  await importFolderMaterials(page);
  const studies = await readIndexedDBStore<Array<{ studyId: string; subject: string; title: string }>[number]>(page, "studies");
  const algorithms = studies.find((study) => study.subject === "Algoritmos")!;
  await page.goto(`/estudo?tema=${algorithms.studyId}`);
  const navigation = page.getByRole("complementary", { name: "Navegação dos estudos" });
  await navigation.getByRole("link", { name: "SQL", exact: true }).click();
  await expect(page.getByRole("heading", { name: "SQL", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Banco de Dados");

  await page.goto("/biblioteca");
  const card = page.getByRole("article", { name: "sql.txt" });
  await card.getByRole("link", { name: "Abrir" }).click();
  await expect(page).toHaveURL(/arquivo=/);
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("sql.txt");
});

test("seleção múltipla favoritar, adicionar tags e excluir exige confirmação", async ({ page }) => {
  await importFolderMaterials(page);
  await page.goto("/biblioteca");
  await page.getByLabel("Selecionar vetores.txt").check();
  await page.getByLabel("Selecionar sql.txt").check();
  await page.getByRole("toolbar", { name: "Ações dos materiais selecionados" }).getByRole("button", { name: "Favoritar" }).click();
  await expect(page.getByRole("toolbar", { name: "Ações dos materiais selecionados" })).toBeHidden();
  let materials = await readIndexedDBStore<Array<{ isFavorite: boolean }>[number]>(page, "documents");
  expect(materials.every((material) => material.isFavorite)).toBe(true);

  await page.getByLabel("Selecionar vetores.txt").check();
  await page.getByLabel("Selecionar sql.txt").check();
  await page.getByRole("toolbar", { name: "Ações dos materiais selecionados" }).getByRole("button", { name: "Adicionar tags" }).click();
  await page.getByLabel("Tags dos materiais").fill("prova, revisar");
  await page.getByRole("dialog").getByRole("button", { name: "Adicionar tags" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("toolbar", { name: "Ações dos materiais selecionados" })).toBeHidden();

  await page.getByLabel("Selecionar vetores.txt").check();
  await page.getByLabel("Selecionar sql.txt").check();
  await page.getByRole("toolbar", { name: "Ações dos materiais selecionados" }).getByRole("button", { name: "Excluir" }).click();
  await expect(page.getByRole("dialog")).toContainText("Não poderá ser desfeita");
  await page.getByRole("dialog").getByRole("button", { name: "Confirmar exclusão" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("Você ainda não possui materiais.", { exact: true })).toBeVisible();
  materials = await readIndexedDBStore(page, "documents");
  expect(materials).toHaveLength(0);
});

test("drag and drop move arquivo entre temas", async ({ page }) => {
  await importFolderMaterials(page);
  await page.goto("/organizar");
  const source = page.getByText("vetores.txt", { exact: true }).locator("xpath=ancestor::li[1]");
  const target = page.getByRole("list", { name: "SQL: arquivos" }).locator("xpath=parent::li");
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await source.dispatchEvent("dragstart", { dataTransfer });
  await target.dispatchEvent("dragover", { dataTransfer });
  await target.dispatchEvent("drop", { dataTransfer });
  await expect(page.getByRole("status")).toContainText("arrastar e soltar");
  const materials = await readIndexedDBStore<Array<{ name: string; subject: string; topic: string }>[number]>(page, "documents");
  expect(materials.find((material) => material.name === "vetores.txt")).toMatchObject({ subject: "Banco de Dados", topic: "SQL" });
});
