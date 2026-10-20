import { expect, test, type Download, type Page } from "@playwright/test";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import type { AcademyStudy } from "../src/features/academy/types";
import type { StudioDocument, StudioDocumentType } from "../src/features/academy/studio/types";
import { extractPdfText } from "./helpers/pdf-text";
import { readIndexedDBStore } from "./helpers/indexed-db";

const generationResponses = {
  outline: {
    title: "Apostila de exportação",
    objective: "Validar a exportação profissional do Academy Studio.",
    prerequisites: ["JavaScript básico"],
    modules: [{ id: "module-1", title: "Fundamentos", objective: "Entender a exportação", estimatedMinutes: 30, order: 0, status: "not-started", progress: 0, chapterIds: [] }],
    nextSteps: ["Exportar para PDF"],
  },
  lessons: {
    chapters: [{ id: "chapter-1", title: "Introdução à exportação", objective: "Conhecer o fluxo", content: "A exportação usa o AI Core e o Design System existentes.", concepts: ["Exportação"], examples: ["Exemplo de apostila"] }],
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

async function mockAcademyGeneration(page: Page) {
  await page.route("**/api/academy/generate", async (route) => {
    const body = route.request().postDataJSON() as { stage: "outline" | "lessons" | "practice" };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ stage: body.stage, data: generationResponses[body.stage], provider: "gemini", model: "gemini-test", usage: { inputTokens: 10, outputTokens: 20 }, cached: false }),
    });
  });
}

async function createAcademyStudy(page: Page) {
  await mockAcademyGeneration(page);
  await page.goto("/academy");
  await page.getByRole("button", { name: "Criar estudo livre" }).click();
  await page.getByRole("textbox", { name: "Tema", exact: true }).fill("Apostila de exportação");
  await page.getByRole("textbox", { name: "Matéria", exact: true }).fill("Estruturas de Dados");
  await page.getByRole("button", { name: "Criar estudo", exact: true }).click();
  await page.getByRole("button", { name: "Gerar", exact: true }).click();
  await page.getByRole("button", { name: "Gerar conteúdo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Abrir conteúdo" })).toBeVisible();
  const academy = await readIndexedDBStore<AcademyStudy>(page, "academy");
  const study = academy[0];
  const content = study?.contents[0];
  if (!study || !content) throw new Error("O conteúdo da Academy não foi persistido.");
  return { studyId: study.id, contentId: content.id };
}

const ACCENTED_SECTION = "Acentuação brasileira:不可以 não. Teste de ç, ã, õ, é, í, ú e â.";

function customization(overrides: Record<string, unknown> = {}) {
  return {
    template: "academic",
    colorScheme: "blue",
    fontFamily: "aptos",
    fontSize: "medium",
    spacing: "normal",
    orientation: "portrait",
    pageNumbering: "bottom-center",
    pageMargins: "normal",
    headerFooter: { enabled: true, headerText: "Cabeçalho do Studio", footerText: "Rodapé do Studio", showPageNumbers: true },
    coverPage: { enabled: true, title: "Título da capa", subtitle: "Subtítulo da capa", author: "Autor do teste", date: "19/10/2026" },
    tableOfContents: { enabled: true, depth: 2 },
    ...overrides,
  };
}

function documentFixture(studyId: string, contentId: string, overrides: Record<string, unknown> = {}): StudioDocument {
  const now = new Date().toISOString();
  return {
    id: "studio-fixture-document",
    studyId,
    contentId,
    type: "document",
    kind: "study-material",
    title: "Apostila de exportação",
    template: "academic",
    customization: customization(),
    documentStructure: {
      id: "structure-fixture",
      title: "Apostila de exportação",
      subtitle: "Subtítulo estrutural",
      description: "Descrição do documento",
      metadata: { author: "Autor do teste", subject: "Estruturas de Dados", keywords: ["exportação"], createdAt: now, updatedAt: now },
      sections: [
        { id: "sec-1", type: "heading", title: "Introdução", level: 1, order: 0, content: "Introdução ao material exportado." },
        { id: "sec-2", type: "paragraph", title: "Acentos", level: 2, order: 1, content: ACCENTED_SECTION },
        { id: "sec-3", type: "table", title: "Tabela", level: 2, order: 2, content: "| Conceito | Definição |\n| --- | --- |\n| Vetor | Sequência de elementos |" },
        { id: "sec-4", type: "code", title: "Código", level: 2, order: 3, content: "```ts\nconst total = 1 + 2;\n```" },
        { id: "sec-5", type: "exercise", title: "Exercícios", level: 1, order: 4, content: "**1. Exporte o material.**\n\nDica: use a aba Exportar.\n\nResposta: o arquivo é salvo na Biblioteca." },
        { id: "sec-6", type: "summary", title: "Resumo", level: 1, order: 5, content: "Resumo do material exportado." },
      ],
    },
    version: 3,
    status: "draft",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as StudioDocument;
}

function deckFixture(studyId: string, contentId: string): StudioDocument {
  const now = new Date().toISOString();
  return {
    id: "studio-fixture-deck",
    studyId,
    contentId,
    type: "presentation",
    kind: "study-material",
    title: "Apresentação de exportação",
    template: "academic-presentation",
    customization: customization({ template: "academic-presentation", orientation: "landscape", colorScheme: "teal", coverPage: { enabled: true, title: "Apresentação de exportação", subtitle: "Subtítulo", author: "Autor do teste", date: "19/10/2026" } }),
    slides: [
      { id: "slide-1", layout: "cover", title: "Capa da apresentação", content: "Subtítulo da capa", order: 0 },
      { id: "slide-2", layout: "title-content", title: "Título editável", content: "Primeiro item\nSegundo item", presenterNotes: "Nota do apresentador para o slide 2.", order: 1 },
      { id: "slide-3", layout: "two-column", title: "Duas colunas", content: "Coluna esquerda\nColuna direita", order: 2 },
      { id: "slide-4", layout: "exercise", title: "Exercício da apresentação", content: "**Pergunta do exercício**\n\nResposta: resposta da apresentação", order: 3 },
    ],
    version: 2,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  } as StudioDocument;
}

async function seedDocument(page: Page, document: StudioDocument) {
  // Garante que o aplicativo já criou o banco completo antes do fixture.
  await page.goto("/storage");
  await expect(page.getByText("studyai-db", { exact: true })).toBeVisible();
  await page.evaluate(async (record) => {
    const scope = localStorage.getItem("studyai:storage-scope") || "guest";
    const databaseName = scope === "guest" ? "studyai-db" : `studyai-db:${scope}`;
    const version = 5;
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(databaseName, version);
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
        transaction.objectStore("studio-documents").put(record);
        transaction.oncomplete = () => { database.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  }, document as unknown as Record<string, unknown>);
}

function studioUrl(studyId: string, contentId: string, type: StudioDocumentType = "document") {
  return `/academy/studio?estudo=${encodeURIComponent(studyId)}&conteudo=${encodeURIComponent(contentId)}&tipo=${type}`;
}

async function openStudio(page: Page, studyId: string, contentId: string, type: StudioDocumentType = "document") {
  await page.goto(studioUrl(studyId, contentId, type));
  await expect(page.locator('section[aria-label="Editor"]')).toBeVisible();
}

async function exportDocument(page: Page, label: "Exportar PDF" | "Exportar PowerPoint"): Promise<Download> {
  const sidebar = page.locator('aside[aria-label="Painel do Studio"]');
  await sidebar.getByRole("tab", { name: "Exportar" }).click();
  const download = page.waitForEvent("download");
  await sidebar.getByRole("button", { name: label }).click();
  return download;
}

async function downloadBytes(download: Download): Promise<Buffer> {
  const path = await download.path();
  if (!path) throw new Error("O download não produziu arquivo.");
  const { readFile } = await import("node:fs/promises");
  return readFile(path);
}

test("PDF do Studio é válido, estruturado e preserva título, acentos, tabelas e código", async ({ page }) => {
  const { studyId, contentId } = await createAcademyStudy(page);
  await seedDocument(page, documentFixture(studyId, contentId));
  await openStudio(page, studyId, contentId);

  const download = await exportDocument(page, "Exportar PDF");
  expect(download.suggestedFilename()).toMatch(/-studio\.pdf$/);
  const bytes = await downloadBytes(download);
  expect(bytes.length).toBeGreaterThan(1_000);

  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBeGreaterThanOrEqual(4);
  expect(pdf.getTitle()).toBe("Apostila de exportação");
  expect(pdf.getAuthor()).toBe("Autor do teste");

  const text = extractPdfText(bytes);
  expect(text).toContain("Título da capa");
  expect(text).toContain("Introdução");
  expect(text).toContain("ç");
  expect(text).toContain("ã");
  expect(text).toContain("Vetor");
  expect(text).toContain("const total");
  expect(text).toContain("Resumo do material exportado.");
});

test("PDF aplica o template, a orientação e as margens escolhidas no Studio", async ({ page }) => {
  const { studyId, contentId } = await createAcademyStudy(page);
  const fixture = documentFixture(studyId, contentId, {
    customization: customization({
      colorScheme: "green",
      orientation: "landscape",
      pageMargins: "wide",
      headerFooter: { enabled: true, headerText: "Cabeçalho do Studio", footerText: "Rodapé do Studio", showPageNumbers: true },
    }),
  });
  await seedDocument(page, fixture);
  await openStudio(page, studyId, contentId);

  const bytes = await downloadBytes(await exportDocument(page, "Exportar PDF"));
  const pdf = await PDFDocument.load(bytes);
  const pdfPage = pdf.getPages()[0];
  const { width, height } = pdfPage.getSize();
  expect(width).toBeGreaterThan(height);

  const text = extractPdfText(bytes);
  expect(text).toContain("Cabeçalho do Studio");
  expect(text).toContain("Rodapé do Studio");
});

test("PPTX do Studio é um pacote Open XML válido com elementos editáveis", async ({ page }) => {
  const { studyId, contentId } = await createAcademyStudy(page);
  await seedDocument(page, deckFixture(studyId, contentId));
  await openStudio(page, studyId, contentId, "presentation");

  const download = await exportDocument(page, "Exportar PowerPoint");
  expect(download.suggestedFilename()).toMatch(/-studio\.pptx$/);
  const bytes = await downloadBytes(download);
  expect(bytes.length).toBeGreaterThan(1_000);

  const archive = await JSZip.loadAsync(bytes);
  expect(archive.file("ppt/presentation.xml")).not.toBeNull();
  expect(archive.file("ppt/slides/slide1.xml")).not.toBeNull();
  expect(archive.file("ppt/theme/theme1.xml")).not.toBeNull();
  expect(archive.file("ppt/notesMasters/notesMaster1.xml")).not.toBeNull();

  const slides = Object.keys(archive.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
  expect(slides).toHaveLength(4);

  const presentation = await archive.file("ppt/presentation.xml")!.async("string");
  expect(presentation).toContain('cx="12192000"');
  expect(presentation).toContain('cy="6858000"');

  const second = await archive.file("ppt/slides/slide2.xml")!.async("string");
  expect(second).toContain("<p:sp>");
  expect(second).toContain("<a:t>Primeiro item</a:t>");
  expect(second).toContain("Título editável");
  expect(second).not.toContain("<p:pic>");
});

test("PPTX mantém notas do apresentador e o tema aplicado", async ({ page }) => {
  const { studyId, contentId } = await createAcademyStudy(page);
  await seedDocument(page, deckFixture(studyId, contentId));
  await openStudio(page, studyId, contentId, "presentation");

  const bytes = await downloadBytes(await exportDocument(page, "Exportar PowerPoint"));
  const archive = await JSZip.loadAsync(bytes);
  const notes = await archive.file("ppt/notesSlides/notesSlide2.xml")!.async("string");
  expect(notes).toContain("Nota do apresentador para o slide 2.");

  const theme = await archive.file("ppt/theme/theme1.xml")!.async("string");
  expect(theme).toContain("2F8085");
});

test("exportação salva o artefato na Biblioteca e permite reabrir a fonte no Studio", async ({ page }) => {
  const { studyId, contentId } = await createAcademyStudy(page);
  await seedDocument(page, documentFixture(studyId, contentId));
  await openStudio(page, studyId, contentId);

  await exportDocument(page, "Exportar PDF");
  const sidebar = page.locator('aside[aria-label="Painel do Studio"]');
  await expect(sidebar.getByText("Exportação concluída")).toBeVisible();

  const materials = await readIndexedDBStore<{ id: string; fileType: string; academyStudioDocumentId?: string; size: number }>(page, "documents");
  const exported = materials.find((material) => material.id === "studio-export-studio-fixture-document-pdf");
  expect(exported).toBeDefined();
  expect(exported?.fileType).toBe("pdf");
  expect(exported?.academyStudioDocumentId).toBe("studio-fixture-document");
  expect(exported?.size).toBeGreaterThan(0);

  const documents = await readIndexedDBStore<StudioDocument>(page, "studio-documents");
  await expect.poll(async () => {
    const stored = await readIndexedDBStore<StudioDocument>(page, "studio-documents");
    return stored.find((document) => document.id === "studio-fixture-document")?.exports?.[0]?.kind;
  }).toBe("pdf");
  const stored = documents.find((document) => document.id === "studio-fixture-document");
  expect(stored?.status).toBe("exported");
});

test("reexportar após edição substitui o artefato sem duplicar materiais", async ({ page }) => {
  const { studyId, contentId } = await createAcademyStudy(page);
  await seedDocument(page, documentFixture(studyId, contentId));
  await openStudio(page, studyId, contentId);

  await exportDocument(page, "Exportar PDF");
  const first = await readIndexedDBStore<{ id: string }>(page, "documents");
  expect(first.filter((material) => material.id.startsWith("studio-export-studio-fixture-document"))).toHaveLength(1);

  const editor = page.locator('section[aria-label="Editor"]');
  await editor.getByPlaceholder("Escreva o conteúdo da seção (Markdown permitido)").fill("Conteúdo revisado antes da nova exportação.");
  await editor.getByPlaceholder("Escreva o conteúdo da seção (Markdown permitido)").blur();
  await page.getByRole("button", { name: "Salvar" }).click();

  const bytes = await downloadBytes(await exportDocument(page, "Exportar PDF"));
  const text = extractPdfText(bytes);
  expect(text).toContain("Conteúdo revisado antes da nova exportação.");

  const second = await readIndexedDBStore<{ id: string }>(page, "documents");
  expect(second.filter((material) => material.id.startsWith("studio-export-studio-fixture-document"))).toHaveLength(1);

  const documents = await readIndexedDBStore<StudioDocument>(page, "studio-documents");
  const source = documents.find((document) => document.id === "studio-fixture-document");
  expect(source?.documentStructure?.sections[0]?.content).toBe("Conteúdo revisado antes da nova exportação.");
});

test("a Biblioteca oferece o retorno ao Studio e o material exportado", async ({ page }) => {
  const { studyId, contentId } = await createAcademyStudy(page);
  await seedDocument(page, documentFixture(studyId, contentId));
  await openStudio(page, studyId, contentId);
  await exportDocument(page, "Exportar PDF");

  await page.goto("/biblioteca");
  const card = page.getByRole("article", { name: "apostila-de-exportacao-studio.pdf" }).first();
  await expect(card).toBeVisible();
  await expect(card.getByRole("link", { name: "Reabrir no Studio" })).toHaveAttribute(
    "href",
    studioUrl(studyId, contentId, "document"),
  );
});

test("o material exportado abre no Workspace e pode ser baixado", async ({ page }) => {
  const { studyId, contentId } = await createAcademyStudy(page);
  await seedDocument(page, deckFixture(studyId, contentId));
  await openStudio(page, studyId, contentId, "presentation");
  await exportDocument(page, "Exportar PowerPoint");

  await page.goto(`/estudo?tema=${studyId}&arquivo=studio-export-studio-fixture-deck-pptx&aba=material`);
  await expect(page.getByText(/pré-visualização nativa de arquivos do PowerPoint/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Baixar original" }).first()).toBeVisible();
});

test("PDF de documento longo pagina sem perder o conteúdo final", async ({ page }) => {
  const { studyId, contentId } = await createAcademyStudy(page);
  const sections = Array.from({ length: 14 }, (_, index) => ({
    id: `long-${index}`,
    type: "paragraph" as const,
    title: `Capítulo ${index + 1}`,
    level: 1 as const,
    order: index,
    content: `Conteúdo do capítulo ${index + 1}. `.repeat(60) + `Fim do capítulo ${index + 1}.`,
  }));
  const fixture = documentFixture(studyId, contentId, {
    documentStructure: {
      id: "structure-long",
      title: "Apostila técnica longa",
      subtitle: "Documento extenso",
      description: "Apostila com 14 capítulos",
      metadata: { author: "Autor do teste", subject: "Estruturas de Dados", keywords: ["apostila"], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      sections,
    },
  });
  await seedDocument(page, fixture);
  await openStudio(page, studyId, contentId);

  const bytes = await downloadBytes(await exportDocument(page, "Exportar PDF"));
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBeGreaterThanOrEqual(10);
  const text = extractPdfText(bytes).replace(/\s+/g, " ");
  expect(text).toContain("Fim do capítulo 14.");
  expect(text).toContain("Capítulo 1");
});

test("PPTX preserva tabelas editáveis e elementos dentro da área do slide", async ({ page }) => {
  const { studyId, contentId } = await createAcademyStudy(page);
  const deck = deckFixture(studyId, contentId);
  deck.slides = [
    ...(deck.slides ?? []),
    {
      id: "slide-5",
      layout: "title-content" as const,
      title: "Slide com tabela",
      content: "Introdução da tabela\n\n| Conceito | Uso |\n| --- | --- |\n| Vetor | Estrutura linear |",
      order: 4,
    },
  ];
  await seedDocument(page, deck);
  await openStudio(page, studyId, contentId, "presentation");

  const bytes = await downloadBytes(await exportDocument(page, "Exportar PowerPoint"));
  const archive = await JSZip.loadAsync(bytes);
  const slide = await archive.file("ppt/slides/slide5.xml")!.async("string");
  expect(slide).toContain("<a:tbl>");
  expect(slide).toContain("<a:gridCol");
  expect(slide).toContain("Vetor");

  const width = 12_192_000;
  const height = 6_858_000;
  const offsets = [...slide.matchAll(/<a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/g)];
  expect(offsets.length).toBeGreaterThan(0);
  for (const offset of offsets) {
    const x = Number(offset[1]);
    const y = Number(offset[2]);
    const cx = Number(offset[3]);
    const cy = Number(offset[4]);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(x + cx).toBeLessThanOrEqual(width);
    expect(y + cy).toBeLessThanOrEqual(height);
  }
});

test("a exportação não mistura dados entre identidades", async ({ page, browser }) => {
  const { studyId, contentId } = await createAcademyStudy(page);
  await seedDocument(page, documentFixture(studyId, contentId));
  await openStudio(page, studyId, contentId);
  await exportDocument(page, "Exportar PDF");

  const own = await readIndexedDBStore<{ id: string }>(page, "documents");
  expect(own.some((material) => material.id === "studio-export-studio-fixture-document-pdf")).toBe(true);

  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  await otherPage.goto("/");
  await expect(otherPage.getByRole("heading", { level: 1 })).toBeVisible();
  const other = await readIndexedDBStore<{ id: string }>(otherPage, "documents");
  expect(other.some((material) => material.id === "studio-export-studio-fixture-document-pdf")).toBe(false);
  await otherContext.close();
});

test("a prévia permite simular a página exportada", async ({ page }) => {
  const { studyId, contentId } = await createAcademyStudy(page);
  await seedDocument(page, documentFixture(studyId, contentId));
  await openStudio(page, studyId, contentId);

  const preview = page.locator('section[aria-label="Pré-visualização"]');
  await expect(preview.getByRole("button", { name: "Pré-visualizar exportação" })).toBeVisible();
  await preview.getByRole("button", { name: "Pré-visualizar exportação" }).click();
  await expect(preview.getByText(/Simulação da página exportada/)).toBeVisible();
});

test("a exportação de apresentação registra o material PPTX sem duplicar", async ({ page }) => {  const { studyId, contentId } = await createAcademyStudy(page);
  await seedDocument(page, deckFixture(studyId, contentId));
  await openStudio(page, studyId, contentId, "presentation");

  await exportDocument(page, "Exportar PowerPoint");
  const materials = await readIndexedDBStore<{ id: string; fileType: string; academyMaterialKind?: string }>(page, "documents");
  const exported = materials.find((material) => material.id === "studio-export-studio-fixture-deck-pptx");
  expect(exported?.fileType).toBe("pptx");
  expect(exported?.academyMaterialKind).toBe("generated-presentation");
  expect(materials.filter((material) => material.id.startsWith("studio-export-studio-fixture-deck"))).toHaveLength(1);
});

test("erro de exportação é exibido sem travar a interface", async ({ page }) => {
  const { studyId, contentId } = await createAcademyStudy(page);
  await seedDocument(page, documentFixture(studyId, contentId));
  await openStudio(page, studyId, contentId);

  await page.evaluate(() => {
    URL.createObjectURL = () => { throw new Error("falha simulada de exportação"); };
  });
  const sidebar = page.locator('aside[aria-label="Painel do Studio"]');
  await sidebar.getByRole("tab", { name: "Exportar" }).click();
  await sidebar.getByRole("button", { name: "Exportar PDF" }).click();
  await expect(sidebar.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "Salvar" })).toBeEnabled();
});

test("a exportação permanece utilizável no celular", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  const { studyId, contentId } = await createAcademyStudy(page);
  await seedDocument(page, documentFixture(studyId, contentId));
  await openStudio(page, studyId, contentId);

  const sidebar = page.locator('aside[aria-label="Painel do Studio"]');
  await page.getByRole("tab", { name: "Organizar" }).click();
  await expect(sidebar).toBeVisible();
  await sidebar.getByRole("tab", { name: "Exportar" }).click();
  await expect(sidebar.getByRole("button", { name: "Exportar PDF" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
