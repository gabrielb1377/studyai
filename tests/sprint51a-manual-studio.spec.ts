import { expect, test, type Page } from "@playwright/test";
import type { AcademyStudy } from "../src/features/academy/types";
import type { StudioDocument } from "../src/features/academy/studio/types";
import { getAllPedagogicalTemplates, getAllTemplates } from "../src/features/academy/studio/templates";
import { readIndexedDBStore } from "./helpers/indexed-db";

function editorRegion(page: Page) {
  return page.locator('section[aria-label="Editor"]');
}

function sidebarRegion(page: Page) {
  return page.locator('aside[aria-label="Painel do Studio"]');
}

test("catálogo preserva os 12 templates visuais e expõe os 5 templates pedagógicos", () => {
  const visual = getAllTemplates();
  expect(visual).toHaveLength(12);
  expect(visual.filter((item) => item.type === "document")).toHaveLength(6);
  expect(visual.filter((item) => item.type === "presentation")).toHaveLength(6);

  const pedagogical = getAllPedagogicalTemplates();
  expect(pedagogical.map((item) => item.name)).toEqual([
    "Aula estruturada",
    "Resumo esquematizado",
    "Lista de exercícios",
    "Capítulo de apostila",
    "Documento em branco",
  ]);
});

test("cria estudo livre, abre no Studio sem chamar IA e aplica templates pedagógicos com persistência", async ({ page }) => {
  let aiCalled = false;
  await page.route("**/api/academy/generate", async (route) => {
    aiCalled = true;
    await route.abort("failed");
  });

  await page.goto("/academy");
  await page.getByRole("button", { name: "Criar estudo livre" }).click();
  await page.getByRole("textbox", { name: "Tema", exact: true }).fill("Grafos e Busca em Largura");
  await page.getByRole("textbox", { name: "Matéria", exact: true }).fill("Algoritmos");
  await page.getByRole("button", { name: "Criar estudo", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Grafos e Busca em Largura" })).toBeVisible();
  expect(aiCalled).toBe(false);

  // Abre o Academy Studio diretamente pelo card do estudo sem conteúdo gerado por IA.
  await Promise.all([
    page.waitForURL(/\/academy\/studio\?estudo=/),
    page.getByRole("link", { name: "Editar no Studio" }).click(),
  ]);
  const editor = editorRegion(page);
  await expect(editor).toBeVisible();

  // Confirma que nenhum conteúdo fictício de IA foi criado no estudo e que o documento manual foi salvo.
  const academy = await readIndexedDBStore<AcademyStudy>(page, "academy");
  expect(academy).toHaveLength(1);
  expect(academy[0].contents).toHaveLength(0);

  const initialDocs = await readIndexedDBStore<StudioDocument>(page, "studio-documents");
  expect(initialDocs).toHaveLength(1);
  expect(initialDocs[0].contentId).toBeUndefined();
  expect(initialDocs[0].sourceMode).toBe("manual");
  expect(initialDocs[0].pedagogicalTemplate).toBe("structured-lesson");
  expect(initialDocs[0].documentStructure?.sections.map((section) => section.title)).toEqual([
    "Objetivos da aula",
    "Introdução e contexto",
    "Conceitos fundamentais",
    "Exemplo aplicado",
    "Atividade de verificação",
    "Síntese da aula",
  ]);

  // Aplica o template pedagógico "Lista de exercícios" pelo seletor do editor.
  await editor.getByLabel("Template pedagógico").selectOption("exercise-list");
  await expect
    .poll(async () => (await readIndexedDBStore<StudioDocument>(page, "studio-documents"))[0]?.pedagogicalTemplate)
    .toBe("exercise-list");
  await expect
    .poll(async () => (await readIndexedDBStore<StudioDocument>(page, "studio-documents"))[0]?.documentStructure?.sections.map((s) => s.title))
    .toEqual([
      "Orientações de resolução",
      "Questão 1 — Conceitual",
      "Questão 2 — Aplicação prática",
      "Questão 3 — Aprofundamento",
      "Gabarito e revisão de erros",
    ]);

  // Aplica o template pedagógico "Resumo esquematizado" pela aba Templates da barra lateral.
  const sidebar = sidebarRegion(page);
  await sidebar.getByRole("tab", { name: "Templates" }).click();
  await sidebar.getByRole("button", { name: /Resumo esquematizado/ }).click();
  await expect
    .poll(async () => (await readIndexedDBStore<StudioDocument>(page, "studio-documents"))[0]?.pedagogicalTemplate)
    .toBe("structured-summary");

  // Troca o template visual ("Minimalista") sem sobrescrever os blocos do template pedagógico.
  await sidebar.getByRole("button", { name: /Minimalista/ }).first().click();
  await expect
    .poll(async () => (await readIndexedDBStore<StudioDocument>(page, "studio-documents"))[0]?.template)
    .toBe("minimalist");
  const afterVisualChange = (await readIndexedDBStore<StudioDocument>(page, "studio-documents"))[0];
  expect(afterVisualChange.pedagogicalTemplate).toBe("structured-summary");
  expect(afterVisualChange.documentStructure?.sections.map((s) => s.title)).toContain("Visão geral");

  // Edita o primeiro bloco e persiste.
  const textarea = editor.getByPlaceholder("Escreva o conteúdo da seção (Markdown permitido)");
  await textarea.fill("Resumo autoral sobre BFS e fila de visitação em grafos.");
  await textarea.blur();
  await page.getByRole("button", { name: "Salvar" }).click();

  await expect
    .poll(async () => (await readIndexedDBStore<StudioDocument>(page, "studio-documents"))[0]?.documentStructure?.sections[0]?.content)
    .toBe("Resumo autoral sobre BFS e fila de visitação em grafos.");

  // Recarrega e confirma que o documento manual persiste sem duplicar registros.
  await page.reload();
  await expect(editor).toBeVisible();
  await expect(textarea).toHaveValue("Resumo autoral sobre BFS e fila de visitação em grafos.");
  expect(await readIndexedDBStore<StudioDocument>(page, "studio-documents")).toHaveLength(1);

  // Na listagem do Studio, permite reabrir o documento manual sem contentId.
  await page.goto("/academy/studio");
  await expect(page.getByText("1 documento salvo")).toBeVisible();
  await page.getByRole("button", { name: "Reabrir no Studio" }).click();
  await expect(editor).toBeVisible();
  await expect(textarea).toHaveValue("Resumo autoral sobre BFS e fila de visitação em grafos.");
  expect(aiCalled).toBe(false);
});

test("permite escolher Capítulo de apostila ou Documento em branco a partir da página inicial do Studio", async ({ page }) => {
  await page.goto("/academy");
  await page.getByRole("button", { name: "Criar estudo livre" }).click();
  await page.getByRole("textbox", { name: "Tema", exact: true }).fill(" Normalização de Bancos de Dados ");
  await page.getByRole("textbox", { name: "Matéria", exact: true }).fill("Banco de Dados");
  await page.getByRole("button", { name: "Criar estudo", exact: true }).click();

  await page.goto("/academy/studio");
  await page.getByLabel("Template pedagógico para Normalização de Bancos de Dados").selectOption("textbook-chapter");
  await page.getByRole("button", { name: "Editar manualmente no Studio" }).click();

  const editor = editorRegion(page);
  await expect(editor).toBeVisible();
  const docs = await readIndexedDBStore<StudioDocument>(page, "studio-documents");
  expect(docs).toHaveLength(1);
  expect(docs[0].pedagogicalTemplate).toBe("textbook-chapter");
  expect(docs[0].documentStructure?.sections.map((section) => section.title)).toContain("1. Contextualização do capítulo");

  // Aplica "Documento em branco" e confirma estrutura enxuta de 1 seção.
  await editor.getByLabel("Template pedagógico").selectOption("blank-document");
  await expect
    .poll(async () => (await readIndexedDBStore<StudioDocument>(page, "studio-documents"))[0]?.documentStructure?.sections.length)
    .toBe(1);
});
