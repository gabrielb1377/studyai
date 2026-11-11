import { expect, test } from "@playwright/test";
import { detectExercises, uncertainExtractionLines } from "../src/features/ocr/exercise-review";
import { createTextPdf } from "./helpers/pdf-file";
import { enableAdvancedMode } from "./helpers/experience";
import { readIndexedDBStore } from "./helpers/indexed-db";
import type { ExtractedContent } from "../src/features/extraction/ExtractionTypes";


test("preserva enunciado, alternativas A–E, separação e proveniência", () => {
  const text = "Questão 12. Qual é o valor?\nUse a expressão abaixo.\nA) 1\nB) 2\nC) 3\nD) 4\nE) 5\nGabarito: B\n13. Outra questão\nA) Sim\nB) Não";
  const exercises = detectExercises(text, 4);
  expect(exercises).toHaveLength(2);
  expect(exercises[0]).toMatchObject({ page: 4, number: "12", firstLine: 1, lastLine: 7, statement: "Qual é o valor?\nUse a expressão abaixo." });
  expect(exercises[0].alternatives).toEqual(["A", "B", "C", "D", "E"].map((label, index) => ({ label, text: String(index + 1) })));
  expect(exercises[1]).toMatchObject({ number: "13", firstLine: 9 });
  expect(detectExercises("Questão 1. Ambígua\nA) 1\nC) 3", 1)).toEqual([]);
  expect(detectExercises("Texto sem questões", 1)).toEqual([]);
});

test("marca símbolos e fórmulas para revisão sem corrigir por inferência", () => {
  expect(uncertainExtractionLines("Leia o enunciado\nx² = √α\nSímbolo �\n1/2")).toEqual([2, 3, 4]);
});

test("PDF inválido recebe diagnóstico sem iniciar OCR", async ({ page }) => {
  const ocrRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/ocr/")) ocrRequests.push(request.url());
  });
  await page.goto("/importar");
  await page.getByLabel("Selecionar arquivos do dispositivo").setInputFiles({
    name: "corrompido.pdf", mimeType: "application/pdf", buffer: Buffer.from("arquivo sem estrutura PDF"),
  });
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await expect(page.getByText("Erro", { exact: true })).toBeVisible();
  const [record] = await readIndexedDBStore<ExtractedContent>(page, "contents");
  expect(record).toMatchObject({ status: "error", errorDetails: { fileName: "corrompido.pdf" } });
  expect(ocrRequests).toEqual([]);
});

test("cancelar OCR preserva a imagem para revisão", async ({ page }) => {
  await page.setContent('<main style="font:48px Arial">EXERCICIO</main>');
  const image = await page.locator("main").screenshot();
  await page.goto("/importar");
  await page.getByLabel("Selecionar arquivos do dispositivo").setInputFiles({
    name: "cancelar.png", mimeType: "image/png", buffer: image,
  });
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByText(/Importação cancelada/)).toBeVisible({ timeout: 20_000 });
  const [material] = await readIndexedDBStore<{ id: string }>(page, "documents");
  const original = await page.evaluate(async (id) => {
    const root = await navigator.storage.getDirectory();
    const base = await root.getDirectoryHandle("studyai-materials");
    const scope = await base.getDirectoryHandle("user-offline-session");
    const file = await (await scope.getFileHandle(id)).getFile();
    return Array.from(new Uint8Array(await file.arrayBuffer()));
  }, material.id);
  expect(Buffer.from(original)).toEqual(image);
});

test("revisão edita o texto, conserva a extração original e só envia após ação no Tutor", async ({ page }) => {
  await enableAdvancedMode(page);
  const calls: string[] = [];
  await page.route("**/api/tutor", async (route) => {
    calls.push(route.request().postDataJSON().message);
    await route.fulfill({ json: { text: "Resposta do teste.", provider: "gemini", model: "mock" } });
  });
  await page.goto("/importar");
  await page.getByLabel("Selecionar arquivos do dispositivo").setInputFiles({
    name: "questao.pdf", mimeType: "application/pdf", buffer: createTextPdf(["Questao 1. Qual e a soma?", "A) 1", "B) 2"]),
  });
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await expect(page.getByText("Extraído", { exact: true })).toBeVisible();
  await page.goto("/biblioteca");
  await page.getByRole("link", { name: "Revisar", exact: true }).click();
  await expect(page).toHaveURL(/aba=revisao/, { timeout: 25_000 });
  const editor = page.getByRole("textbox", { name: "Texto extraído da página 1" });
  await expect(editor).toHaveValue(/Qual e a soma/);
  await editor.fill("Questão 1. Quanto é 1 + 1?\nA) 1\nB) 2");
  await page.getByRole("button", { name: "Salvar correção" }).click();
  await expect(page.getByText(/Correção salva/)).toBeVisible();
  const [record] = await readIndexedDBStore<ExtractedContent>(page, "contents");
  expect(record.pages?.[0].originalText).toContain("Qual e a soma");
  expect(record.pages?.[0].text).toContain("Quanto é 1 + 1?");
  await page.getByRole("button", { name: "Confirmar texto e abrir Tutor" }).click();
  await expect(page).toHaveURL(/\/tutor$/);
  const composer = page.getByRole("textbox", { name: "Mensagem para o Tutor IA" });
  if (!(await composer.isVisible())) await page.getByRole("button", { name: "Nova conversa" }).first().click();
  await expect(composer).toHaveValue(/Quanto é 1 \+ 1\?/);
  expect(calls).toEqual([]);
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.getByText("Resposta do teste.", { exact: true })).toBeVisible();
  expect(calls).toHaveLength(1);
  expect(calls[0]).toContain("Fonte revisada: questao.pdf, página 1.");
});
