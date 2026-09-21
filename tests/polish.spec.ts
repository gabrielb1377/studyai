import { expect, test } from "@playwright/test";

import { AIResponseCache } from "../src/features/ai/AIResponseCache";
import { ContextCompressor } from "../src/features/ai/ContextCompressor";
import { TokenCounter } from "../src/features/ai/TokenCounter";
import type { AIManagerRequest, AIResponse } from "../src/features/ai/AIProvider";
import type { RetrievedChunk } from "../src/features/retrieval/RetrievalTypes";
import { readIndexedDBStore } from "./helpers/indexed-db";
import { createTextPdf } from "./helpers/pdf-file";
import { importTextMaterial } from "./helpers/real-study";

test("compressor limita histórico, remove chunks repetidos e contabiliza tokens", () => {
  const history = Array.from({ length: 12 }, (_, index) => ({
    role: index % 2 === 0 ? "user" as const : "assistant" as const,
    content: `Mensagem longa ${index} ${"contexto ".repeat(80)}`,
  }));
  const chunks = Array.from({ length: 6 }, (_, index) => ({
    id: `chunk-${index}`,
    studyId: "study",
    fileId: index < 2 ? "same" : `file-${index}`,
    chunkIndex: index,
    text: index < 2 ? "Trecho duplicado" : `Trecho relevante ${index}`,
    score: 100 - index,
    matchedTerms: [],
    metadata: {
      extractedContentId: `content-${index}`,
      sourceName: "material.txt",
      fileType: "txt" as const,
      mimeType: "text/plain",
      size: 100,
    },
  })) satisfies RetrievedChunk[];

  const result = ContextCompressor.compress(history, chunks, { maxHistoryTokens: 500, maxChunkTokens: 100 });
  expect(result.chunks).toHaveLength(3);
  expect(new Set(result.chunks.map((chunk) => chunk.text)).size).toBe(3);
  expect(result.statistics.compressedHistoryTokens).toBeLessThan(result.statistics.originalHistoryTokens);
  expect(result.statistics.chunkTokens).toBeLessThanOrEqual(100);
  expect(TokenCounter.estimate("Uma frase curta para contagem.")).toBeGreaterThan(0);
});

test("cache reutiliza a resposta para o mesmo provider, modelo, prompt e contexto", () => {
  const request: AIManagerRequest = {
    history: [{ role: "user", content: "Contexto" }],
    message: "Explique vetores",
    provider: "gemini",
  };
  const response: AIResponse = { provider: "gemini", model: "gemini-test", text: "Resposta em cache" };
  const key = AIResponseCache.keyFor(request, "gemini", "gemini-test");
  AIResponseCache.set(key, response);
  expect(AIResponseCache.get(key)).toMatchObject(response);
  expect(AIResponseCache.keyFor({ ...request, message: "Outro prompt" }, "gemini", "gemini-test")).not.toBe(key);
});

test("Tutor processa streaming NDJSON e renderiza Markdown, GFM, matemática e métricas", async ({ page }) => {
  const markdown = [
    "# Vetores",
    "",
    "- [x] Índices",
    "- [ ] Revisar",
    "",
    "| Conceito | Valor |",
    "| --- | --- |",
    "| Índice | 0 |",
    "",
    "```ts",
    "const vetor = [1, 2];",
    "```",
    "",
    "> [!NOTE] Um callout.",
    "",
    "A fórmula é $x^2$.",
  ].join("\n");
  const middle = Math.floor(markdown.length / 2);
  const body = [
    JSON.stringify({ type: "delta", text: markdown.slice(0, middle) }),
    JSON.stringify({ type: "delta", text: markdown.slice(middle) }),
    JSON.stringify({
      type: "done",
      response: {
        provider: "gemini",
        model: "gemini-test",
        text: markdown,
        usage: { inputTokens: 120, outputTokens: 45, contextTokens: 70, historyTokens: 20, chunkTokens: 30 },
        execution: { cached: true },
      },
    }),
  ].join("\n") + "\n";
  await page.route("**/api/tutor", (route) => route.fulfill({
    contentType: "application/x-ndjson",
    body,
  }));
  await page.goto("/tutor");
  await page.getByRole("button", { name: "Nova conversa" }).first().click();
  const initialHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.getByLabel("Mensagem para o Tutor IA").fill("Explique vetores");
  await page.getByRole("button", { name: "Enviar" }).click();

  const conversation = page.getByRole("region", { name: "Conversa com o Tutor IA" });
  await expect(conversation.getByRole("heading", { name: "Vetores" })).toBeVisible();
  await expect(conversation.getByRole("table")).toBeVisible();
  await expect(conversation.getByText("const vetor = [1, 2];", { exact: true })).toBeVisible();
  await expect(conversation.locator(".katex")).toBeVisible();
  await expect(conversation).toContainText("Prompt 120");
  await expect(conversation).toContainText("Contexto 70");
  await expect(conversation).toContainText("Chunks 30");
  await expect(conversation).toContainText("cache");
  expect(await conversation.evaluate((element) => element.scrollHeight >= element.clientHeight)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(initialHeight);
});

test("PDF original persiste no OPFS e Ctrl+F navega e destaca ocorrências", async ({ page }) => {
  await page.goto("/importar");
  await page.getByLabel("Selecionar arquivos do dispositivo").setInputFiles({
    name: "vetores-persistentes.pdf",
    mimeType: "application/pdf",
    buffer: createTextPdf(["Vetores possuem indices", "Vetores armazenam dados"]),
  });
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Extração concluída" })).toBeVisible();
  const [material] = await readIndexedDBStore<{ id: string; studyId: string; persistentBinary?: boolean }>(page, "documents");
  expect(material.persistentBinary).toBe(true);

  await page.goto(`/estudo?tema=${material.studyId}&arquivo=${material.id}`);
  await expect(page.getByLabel("Página atual do PDF")).toContainText("Página 1 de 1");
  await page.reload();
  await expect(page.getByText("Procurando o PDF original", { exact: false })).toBeHidden();
  await expect(page.getByLabel("Página atual do PDF")).toContainText("Página 1 de 1");
  await page.keyboard.press("Control+f");
  await expect(page.getByLabel("Buscar no PDF")).toBeFocused();
  await page.getByLabel("Buscar no PDF").fill("Vetores");
  await expect(page.getByText("1/2", { exact: true })).toBeVisible();
  await expect(page.locator("mark").filter({ hasText: "Vetores" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Próxima ocorrência" }).click();
  await expect(page.getByText("2/2", { exact: true })).toBeVisible();
});

test("diagnóstico fica em drawer e pipeline não ocupa o Dashboard", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Pipeline de ingestão" })).toBeHidden();
  await page.getByRole("button", { name: "Detalhes da ingestão" }).click();
  const drawer = page.getByRole("dialog", { name: "Detalhes da ingestão" });
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText("Tokens");
  await expect(drawer).toContainText("Embeddings");
  await drawer.getByRole("button", { name: "Fechar detalhes da ingestão" }).click();
  await expect(drawer).toBeHidden();
});

test("drop em nova estrutura cria hierarquia e organização usa autosave", async ({ page }) => {
  await importTextMaterial(page, "novo-tema.txt", "Conteúdo de um novo tema.");
  await page.goto("/organizar");
  const source = page.getByText("novo-tema.txt", { exact: true }).locator("xpath=ancestor::li[1]");
  await source.dragTo(page.locator('[data-drop-level="new"]'));
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Curso", exact: true }).fill("Novo curso");
  await dialog.getByRole("textbox", { name: "Semestre", exact: true }).fill("2º semestre");
  await dialog.getByRole("textbox", { name: "Matéria", exact: true }).fill("Nova matéria");
  await dialog.getByRole("textbox", { name: "Tema", exact: true }).fill("Novo tema");
  await expect(dialog.getByRole("status")).toHaveText("Alterações salvas automaticamente");
  await dialog.getByRole("button", { name: "Fechar" }).first().click();
  const [material] = await readIndexedDBStore<{ course: string; semester: string; subject: string; topic: string }>(page, "documents");
  expect(material).toMatchObject({ course: "Novo curso", semester: "2º semestre", subject: "Nova matéria", topic: "Novo tema" });
});

test("pdf.js permanece lazy até um PDF ser realmente processado", async ({ page }) => {
  await page.goto("/");
  const before = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => entry.name));
  expect(before.some((name) => name.includes("pdf.worker"))).toBe(false);
  await page.goto("/importar");
  await page.getByLabel("Selecionar arquivos do dispositivo").setInputFiles({ name: "lazy.pdf", mimeType: "application/pdf", buffer: createTextPdf(["Lazy PDF"]) });
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Extração concluída" })).toBeVisible();
  const after = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => entry.name));
  expect(after.some((name) => name.includes("pdf.worker"))).toBe(true);
});
