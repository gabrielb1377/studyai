/**
 * QA visual da exportação do Academy Studio.
 *
 * Gera arquivos de exemplo determinísticos (apostila técnica extensa,
 * apresentação e documento com tabelas/código/acentuação) usando a interface
 * real do Studio, salva os artefatos e captura imagens da prévia e do leitor
 * de PDF do próprio StudyAI para inspeção visual.
 *
 * Uso:
 *   1) npm run dev            (em outro terminal)
 *   2) node scripts/qa-studio-export.mjs
 *
 * Saída: test-results/qa-37c2/
 */

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BASE_URL = process.env.QA_BASE_URL ?? "http://localhost:3000";
const OUTPUT = "test-results/qa-37c2";

const generationResponses = {
  outline: {
    title: "Apostila técnica de exportação",
    objective: "Material extenso para validar a paginação, tabelas, código e acentuação.",
    prerequisites: ["JavaScript básico"],
    modules: [{ id: "module-1", title: "Fundamentos", objective: "Entender a exportação", estimatedMinutes: 30, order: 0, status: "not-started", progress: 0, chapterIds: [] }],
    nextSteps: ["Exportar para PDF e PPTX"],
  },
  lessons: {
    chapters: [{ id: "chapter-1", title: "Introdução", objective: "Conhecer o fluxo", content: "A exportação usa o AI Core e o Design System existentes.", concepts: ["Exportação"], examples: ["Apostila com tabelas"] }],
    concepts: [{ name: "Exportação", description: "Geração de PDF e PPTX.", relatedTo: ["Studio"] }],
    examples: ["Apostila com tabelas"],
    summary: "A exportação profissional preserva o conteúdo editado.",
    review: ["Revise a exportação"],
  },
  practice: {
    exercises: [{ id: "exercise-1", type: "practical", question: "Exporte um documento.", guidance: "Use a aba Exportar.", answer: "O arquivo é salvo na Biblioteca.", difficulty: "medium" }],
    studyPlan: ["Editar", "Exportar"],
    flashcards: [{ question: "Onde salvar?", answer: "Na Biblioteca.", difficulty: "easy" }],
    quiz: [{ question: "Qual formato?", alternatives: ["PDF", "CSV", "TXT", "XML"], correctAnswer: 0, explanation: "PDF e PPTX.", difficulty: "easy" }],
  },
};

const ACCENTED = "Acentuação brasileira: não, são,ções, coração, ciòme, íris, ultrassom. Símbolos: → ≤ ≥ ≠ ×.";

function customization(overrides = {}) {
  return {
    template: "academic",
    colorScheme: "blue",
    fontFamily: "aptos",
    fontSize: "medium",
    spacing: "normal",
    orientation: "portrait",
    pageNumbering: "bottom-center",
    pageMargins: "normal",
    headerFooter: { enabled: true, headerText: "Apostila técnica — Academy Studio", footerText: "StudyAI Academy", showPageNumbers: true },
    coverPage: { enabled: true, title: "Apostila técnica de exportação", subtitle: "Estruturas de dados e Design System", author: "StudyAI Academy", date: "19/10/2026" },
    tableOfContents: { enabled: true, depth: 2 },
    ...overrides,
  };
}

function longDocument(studyId, contentId) {
  const now = new Date().toISOString();
  const sections = [];
  for (let index = 0; index < 12; index += 1) {
    sections.push({
      id: `cap-${index}`,
      type: "heading",
      title: `Capítulo ${index + 1} — Conceitos ${index + 1}`,
      level: 1,
      order: index,
      content: `O capítulo ${index + 1} explica os fundamentos com precisão e exemplos. `.repeat(28) + `Encerramento do capítulo ${index + 1}.`,
    });
    if (index === 2) {
      sections.push({
        id: "tabela-qa",
        type: "table",
        title: "Tabela de complexidades",
        level: 2,
        order: index + 0.5,
        content: "| Estrutura | Busca | Inserção |\n| --- | --- | --- |\n| Vetor | O(n) | O(1) |\n| Lista | O(n) | O(1) |\n| Árvore | O(log n) | O(log n) |",
      });
    }
    if (index === 4) {
      sections.push({
        id: "codigo-qa",
        type: "code",
        title: "Exemplo em TypeScript",
        level: 2,
        order: index + 0.5,
        content: "```ts\ninterface No<T> { valor: T }\nfunction primeiro<T>(lista: No<T>[]): T | undefined {\n  return lista[0]?.valor;\n}\n```",
      });
    }
    if (index === 6) {
      sections.push({
        id: "acentos-qa",
        type: "paragraph",
        title: "Acentuação e símbolos",
        level: 2,
        order: index + 0.5,
        content: ACCENTED,
      });
    }
  }
  sections.push({
    id: "ex-qa",
    type: "exercise",
    title: "Exercícios",
    level: 1,
    order: 99,
    content: "**1. Exporte a apostila em PDF.**\n\nDica: use a aba Exportar do Studio.\n\nResposta: o arquivo é salvo na Biblioteca.",
  });
  sections.push({
    id: "resumo-qa",
    type: "summary",
    title: "Conclusão",
    level: 1,
    order: 100,
    content: "A exportação profissional preserva estrutura, ordem, tabelas, código e acentuação.",
  });

  return {
    id: "qa-document",
    studyId,
    contentId,
    type: "document",
    kind: "study-material",
    title: "Apostila técnica de exportação",
    template: "academic",
    customization: customization(),
    documentStructure: {
      id: "qa-structure",
      title: "Apostila técnica de exportação",
      subtitle: "Estruturas de dados e Design System",
      description: "Material extenso com tabelas, código e acentuação.",
      metadata: { author: "StudyAI Academy", subject: "Estruturas de Dados", keywords: ["apostila", "exportação"], createdAt: now, updatedAt: now },
      sections,
    },
    version: 4,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
}

function longDeck(studyId, contentId) {
  const now = new Date().toISOString();
  const slides = [{ id: "s-1", layout: "cover", title: "Exportação profissional do StudyAI", content: "Academy Studio", order: 0 }];
  for (let index = 0; index < 13; index += 1) {
    slides.push({
      id: `s-${index + 2}`,
      layout: index % 4 === 3 ? "two-column" : "title-content",
      title: `Slide ${index + 1} — Tema ${index + 1}`,
      content: `Primeiro ponto do slide ${index + 1}.\nSegundo ponto do slide ${index + 1}.\n\nObservação: ${ACCENTED}`,
      presenterNotes: `Notas do apresentador do slide ${index + 1}.`,
      order: index + 1,
    });
  }
  return {
    id: "qa-deck",
    studyId,
    contentId,
    type: "presentation",
    kind: "study-material",
    title: "Apresentação de exportação",
    template: "academic-presentation",
    customization: customization({ template: "academic-presentation", orientation: "landscape", colorScheme: "teal" }),
    slides,
    version: 3,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
}

async function seed(page, record) {
  await page.evaluate(async (value) => {
    const scope = localStorage.getItem("studyai:storage-scope") || "guest";
    const name = scope === "guest" ? "studyai-db" : `studyai-db:${scope}`;
    await new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 5);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains("studio-documents")) {
          database.createObjectStore("studio-documents", { keyPath: "id" });
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("studio-documents", "readwrite");
        transaction.objectStore("studio-documents").put(value);
        transaction.oncomplete = () => { database.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  }, record);
}

async function main() {
  await mkdir(OUTPUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.route("**/api/academy/generate", async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ stage: body.stage, data: generationResponses[body.stage], provider: "gemini", model: "gemini-test", usage: { inputTokens: 10, outputTokens: 20 }, cached: false }),
    });
  });

  await page.goto(`${BASE_URL}/academy`);
  await page.getByRole("button", { name: "Criar estudo livre" }).click();
  await page.getByRole("textbox", { name: "Tema", exact: true }).fill("Apostila técnica de exportação");
  await page.getByRole("textbox", { name: "Matéria", exact: true }).fill("Estruturas de Dados");
  await page.getByRole("button", { name: "Criar estudo", exact: true }).click();
  await page.getByRole("button", { name: "Gerar", exact: true }).click();
  await page.getByRole("button", { name: "Gerar conteúdo", exact: true }).click();
  await page.getByRole("button", { name: "Abrir conteúdo" }).waitFor();

  const studyId = await page.evaluate(async () => {
    const request = indexedDB.open("studyai-db", 5);
    const database = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const values = await new Promise((resolve, reject) => {
      const transaction = database.transaction("academy", "readonly");
      const store = transaction.objectStore("academy").getAll();
      store.onsuccess = () => resolve(store.result);
      store.onerror = () => reject(store.error);
    });
    database.close();
    return values[0].id;
  });
  const contentId = await page.evaluate(async () => {
    const request = indexedDB.open("studyai-db", 5);
    const database = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const values = await new Promise((resolve, reject) => {
      const transaction = database.transaction("academy", "readonly");
      const store = transaction.objectStore("academy").getAll();
      store.onsuccess = () => resolve(store.result);
      store.onerror = () => reject(store.error);
    });
    database.close();
    return values[0].contents[0].id;
  });

  await seed(page, longDocument(studyId, contentId));
  await seed(page, longDeck(studyId, contentId));

  const sidebar = () => page.locator('aside[aria-label="Painel do Studio"]');
  const exportAsync = async (label) => {
    const download = page.waitForEvent("download");
    await sidebar().getByRole("button", { name: label }).click();
    const file = await download;
    const target = join(OUTPUT, file.suggestedFilename());
    await file.saveAs(target);
    return target;
  };

  // Documento extenso.
  await page.goto(`${BASE_URL}/academy/studio?estudo=${studyId}&conteudo=${contentId}&tipo=document`);
  await page.locator('section[aria-label="Editor"]').waitFor();
  await page.screenshot({ path: join(OUTPUT, "studio-editor.png"), fullPage: false });
  await sidebar().getByRole("tab", { name: "Exportar" }).click();
  const pdfPath = await exportAsync("Exportar PDF");
  console.log("PDF:", pdfPath);

  // Prévia no modo de exportação.
  await page.locator('section[aria-label="Pré-visualização"]').getByRole("button", { name: "Pré-visualizar exportação" }).click();
  await page.waitForTimeout(400);
  await page.locator('section[aria-label="Pré-visualização"]').screenshot({ path: join(OUTPUT, "preview-exportacao.png") });

  // Apresentação.
  await page.goto(`${BASE_URL}/academy/studio?estudo=${studyId}&conteudo=${contentId}&tipo=presentation`);
  await page.locator('section[aria-label="Editor"]').waitFor();
  await sidebar().getByRole("tab", { name: "Exportar" }).click();
  const pptxPath = await exportAsync("Exportar PowerPoint");
  console.log("PPTX:", pptxPath);
  await page.screenshot({ path: join(OUTPUT, "studio-apresentacao.png"), fullPage: false });

  // Leitor de PDF do próprio StudyAI (renderização real do arquivo exportado).
  await page.goto(`${BASE_URL}/estudo?tema=${studyId}&arquivo=studio-export-qa-document-pdf&aba=material`);
  await page.waitForTimeout(3_500);
  await page.screenshot({ path: join(OUTPUT, "pdf-leitor-pagina-1.png"), fullPage: false });

  const canvas = page.locator("canvas:visible").first();
  if (await canvas.count()) {
    await canvas.screenshot({ path: join(OUTPUT, "pdf-pagina-1.png") });
  }

  // Percorre páginas para inspecionar tabela, código e acentuação.
  for (const target of [5, 6, 7, 8]) {
    const thumb = page.getByRole("button", { name: `Abrir miniatura da página ${target}` }).first();
    if (!(await thumb.count())) continue;
    await thumb.click();
    await page.waitForTimeout(1_600);
    try {
      const canvas = page.locator("canvas:visible").last();
      if (await canvas.count()) await canvas.screenshot({ path: join(OUTPUT, `pdf-pagina-${target}.png`) });
    } catch {
      console.log(`Canvas da página ${target} indisponível.`);
    }
  }

  await writeFile(join(OUTPUT, "resumo.txt"), `PDF: ${pdfPath}\nPPTX: ${pptxPath}\n`);
  await browser.close();
  console.log("QA concluída em", OUTPUT);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
