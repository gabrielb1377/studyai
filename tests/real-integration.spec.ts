import { expect, test } from "@playwright/test";

import { TEXT_PDF } from "./helpers/pdf-file";
import { readIndexedDBStore } from "./helpers/indexed-db";

test("importação cria Study e relaciona extração, chunks e embeddings automaticamente", async ({ page }) => {
  await page.goto("/importar");
  await page.getByLabel("Selecionar arquivos do dispositivo").setInputFiles({
    name: "vetores.pdf",
    mimeType: "application/pdf",
    buffer: TEXT_PDF,
  });
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Extração concluída" })).toBeVisible();

  const [materials, studies, contents, chunks, embeddings] = await Promise.all([
    readIndexedDBStore<Array<Record<string, unknown>>[number]>(page, "documents"),
    readIndexedDBStore<Array<Record<string, unknown>>[number]>(page, "studies"),
    readIndexedDBStore<Array<Record<string, unknown>>[number]>(page, "contents"),
    readIndexedDBStore<Array<Record<string, unknown>>[number]>(page, "chunks"),
    readIndexedDBStore<Array<Record<string, unknown>>[number]>(page, "embeddings"),
  ]);
  const state = { material: materials[0], study: studies[0], content: contents[0], chunk: chunks[0], embedding: embeddings[0] };

  expect(state.material).toMatchObject({
    name: "vetores.pdf",
    relativePath: "vetores.pdf",
    subject: "Algoritmos e Estruturas de Dados",
    topic: "vetores",
    status: "ready",
  });
  expect(state.study).toMatchObject({
    studyId: state.material.studyId,
    title: "vetores",
    subject: "Algoritmos e Estruturas de Dados",
    materialIds: [state.material.id],
  });
  expect(state.content).toMatchObject({ studyId: state.material.studyId, fileId: state.material.id });
  expect(state.chunk).toMatchObject({ studyId: state.material.studyId, fileId: state.material.id });
  expect(state.embedding).toMatchObject({ studyId: state.material.studyId, chunkId: state.chunk.id });

  await page.goto("/");
  const dashboardStats = page.getByRole("region", { name: "Resumo dos dados de estudo" });
  await expect(dashboardStats.getByText("Arquivos").locator("..").locator("p").nth(1)).toHaveText("1");
  await expect(dashboardStats.getByText("Estudos").locator("..").locator("p").nth(1)).toHaveText("1");
  await expect(dashboardStats.getByText("Flashcards").locator("..").locator("p").nth(1)).toHaveText("0");
  await expect(dashboardStats.getByText("Quizzes concluídos").locator("..").locator("p").nth(1)).toHaveText("0");
});

test("estrutura de pastas cria matéria, tema e um único Study para os materiais", async ({ page }) => {
  await page.goto("/importar");
  await expect(page.getByRole("button", { name: "Selecionar pasta", exact: true })).toBeVisible();
  await page.getByRole("region", { name: "Arraste seus materiais para cá" }).evaluate((element) => {
    const transfer = new DataTransfer();
    const files = [
      new File(["Vetores possuem índices."], "aula1.txt", { type: "text/plain", lastModified: 1 }),
      new File(["Vetores armazenam elementos."], "aula2.txt", { type: "text/plain", lastModified: 2 }),
    ];
    Object.defineProperty(files[0], "webkitRelativePath", { value: "Algoritmos/Vetores/aula1.txt" });
    Object.defineProperty(files[1], "webkitRelativePath", { value: "Algoritmos/Vetores/aula2.txt" });
    files.forEach((file) => transfer.items.add(file));
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: transfer });
    element.dispatchEvent(event);
  });
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Extração concluída" })).toBeVisible();

  const state = {
    materials: await readIndexedDBStore<Array<{ subject: string; topic: string; studyId: string }>[number]>(page, "documents"),
    studies: await readIndexedDBStore<Array<{ studyId: string; materialIds: string[] }>[number]>(page, "studies"),
    contents: await readIndexedDBStore<Array<{ studyId: string }>[number]>(page, "contents"),
  };
  expect(state.materials).toHaveLength(2);
  expect(state.materials.every((item: { subject: string }) => item.subject === "Algoritmos")).toBe(true);
  expect(state.materials.every((item: { topic: string }) => item.topic === "Vetores")).toBe(true);
  expect(new Set(state.materials.map((item: { studyId: string }) => item.studyId)).size).toBe(1);
  expect(state.studies).toHaveLength(1);
  expect(state.studies[0].materialIds).toHaveLength(2);
  expect(state.contents.every((item: { studyId: string }) => item.studyId === state.studies[0].studyId)).toBe(true);
});

test("fluxo real persiste Tutor, resumo, flashcards e quiz após reabrir a aplicação", async ({ page }) => {
  await page.route("**/api/tutor/summary", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ model: "gemini-test", text: "Resumo baseado exclusivamente no PDF importado." }),
  }));
  await page.route("**/api/tutor/flashcards", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ cards: [{ question: "Qual é o conteúdo?", answer: "O conteúdo extraído do PDF.", difficulty: "easy" }] }),
  }));
  await page.route("**/api/tutor/quiz", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      questions: Array.from({ length: 5 }, (_, index) => ({
        question: `Questão real ${index + 1}`,
        alternatives: ["A", "B", "C", "D"],
        correctAnswer: 0,
        explanation: "Gerada a partir do conteúdo extraído.",
        difficulty: "easy",
      })),
    }),
  }));
  await page.route((url) => url.pathname === "/api/tutor", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ model: "gemini-test", text: "Resposta baseada no contexto persistido." }),
  }));

  await page.goto("/importar");
  await page.getByLabel("Selecionar arquivos do dispositivo").setInputFiles({
    name: "estrutura-de-dados.pdf",
    mimeType: "application/pdf",
    buffer: TEXT_PDF,
  });
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Extração concluída" })).toBeVisible();
  const studyId = (await readIndexedDBStore<Array<{ studyId: string }>[number]>(page, "studies"))[0].studyId;

  await page.goto("/tutor");
  await page.getByRole("button", { name: "Nova conversa" }).first().click();
  await page.getByLabel("Mensagem para o Tutor IA").fill("Explique o material importado");
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(
    page.getByRole("region", { name: "Conversa com o Tutor IA" })
      .getByText("Resposta baseada no contexto persistido.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Gerar resumo" }).click();
  await expect(page.getByRole("dialog").getByText("Salvo automaticamente", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto(`/estudo?tema=${studyId}`);
  await page.getByRole("tab", { name: "Flashcards" }).click();
  await page.getByRole("region", { name: "Flashcards" }).getByRole("button", { name: "Criar flashcards" }).click();
  await expect(page.getByText("Qual é o conteúdo?", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Quiz" }).click();
  await page.getByRole("region", { name: "Quiz" }).getByRole("button", { name: "Criar quiz" }).click();
  await expect(page.getByText("Questão real 1", { exact: true })).toBeVisible();

  const reopened = await page.context().newPage();
  await page.close();
  await reopened.goto(`/estudo?tema=${studyId}`);
  await reopened.getByRole("tab", { name: "Flashcards" }).click();
  await expect(reopened.getByText("Qual é o conteúdo?", { exact: true })).toBeVisible();
  await reopened.getByRole("tab", { name: "Quiz" }).click();
  await expect(reopened.getByText("Questão real 1", { exact: true })).toBeVisible();
  await reopened.getByRole("tab", { name: "IA", exact: true }).click();
  await expect(reopened.getByText("Resumo baseado exclusivamente no PDF importado.", { exact: true })).toBeVisible();

  const persisted = {
    metadata: await readIndexedDBStore<Array<{ key: string; value: unknown[] }>[number]>(reopened, "metadata"),
    summaries: await readIndexedDBStore<Array<{ studyId: string }>[number]>(reopened, "summaries"),
    flashcards: await readIndexedDBStore<Array<{ studyId: string }>[number]>(reopened, "flashcards"),
    quizzes: await readIndexedDBStore<Array<{ kind: string; studyId: string }>[number]>(reopened, "quizzes"),
  };
  const conversations = persisted.metadata.find((item) => item.key === "tutor-conversations")?.value ?? [];
  expect(conversations).toHaveLength(1);
  expect(persisted.summaries[0].studyId).toBe(studyId);
  expect(persisted.flashcards[0].studyId).toBe(studyId);
  expect(persisted.quizzes.filter((item) => item.kind === "question").every((question) => question.studyId === studyId)).toBe(true);
});
