import { expect, test, type Page } from "@playwright/test";
import type { AcademyStudy } from "../src/features/academy/types";
import type { StudioDocument } from "../src/features/academy/studio/types";
import { markdownToSafeHtml, sanitizeHtml, toPlainText } from "../src/features/academy/studio/sanitize";
import { readIndexedDBStore } from "./helpers/indexed-db";

const generationResponses = {
  outline: {
    title: "Dashboard React na prática",
    objective: "Construir um dashboard acessível entendendo estado, componentes e dados.",
    prerequisites: ["JavaScript básico"],
    modules: [{ id: "module-1", title: "Fundamentos", objective: "Entender componentes", estimatedMinutes: 30, order: 0, status: "not-started", progress: 0, chapterIds: [] }],
    nextSteps: ["Publicar uma versão de demonstração"],
  },
  lessons: {
    chapters: [{ id: "chapter-1", title: "Componentes e estado", objective: "Modelar a interface", content: "React utiliza componentes. O estado controla os dados exibidos e depende das interações do usuário.", concepts: ["React", "Estado"], examples: ["Um card de métrica reutilizável"] }],
    concepts: [{ name: "React", description: "Biblioteca para interfaces baseadas em componentes.", relatedTo: ["Estado"] }, { name: "Estado", description: "Dados mutáveis que controlam a interface.", relatedTo: ["React"] }],
    examples: ["Dashboard com métricas"],
    summary: "Componentes organizam a interface e o estado mantém os dados sincronizados.",
    review: ["Explique a diferença entre props e estado"],
  },
  practice: {
    exercises: [{ id: "exercise-1", type: "practical", question: "Crie um card de métrica.", guidance: "Separe apresentação e dados.", answer: "Um componente recebe título e valor por props.", difficulty: "medium" }],
    studyPlan: ["Ler o capítulo", "Implementar o card", "Responder ao quiz"],
    flashcards: [{ question: "O que é estado?", answer: "Dados mutáveis que controlam a interface.", difficulty: "easy" }],
    quiz: [{ question: "Qual recurso controla dados mutáveis?", alternatives: ["Estado", "CSS", "HTML", "Rota"], correctAnswer: 0, explanation: "O estado mantém os dados que mudam durante a interação.", difficulty: "easy" }],
  },
};

async function mockAcademyGeneration(page: Page) {
  await page.route("**/api/academy/generate", async (route) => {
    const body = route.request().postDataJSON() as { stage: "outline" | "lessons" | "practice" };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ stage: body.stage, data: generationResponses[body.stage], provider: "gemini", model: "gemini-test", usage: { inputTokens: 100, outputTokens: 200 }, cached: false }),
    });
  });
}

/** Cria um estudo livre com conteúdo gerado e devolve os identificadores. */
async function createAcademyStudy(page: Page) {
  await mockAcademyGeneration(page);
  await page.goto("/academy");
  await page.getByRole("button", { name: "Criar estudo livre" }).click();
  await page.getByRole("textbox", { name: "Tema", exact: true }).fill("Dashboard com React");
  await page.getByRole("textbox", { name: "Matéria", exact: true }).fill("Desenvolvimento Web");
  await page.getByRole("button", { name: "Criar estudo", exact: true }).click();
  await page.getByRole("button", { name: "Gerar", exact: true }).click();
  await page.getByRole("button", { name: "Gerar conteúdo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Abrir conteúdo" })).toBeVisible();
  const academy = await readIndexedDBStore<AcademyStudy>(page, "academy");
  const study = academy[0];
  const content = study.contents[0];
  if (!study || !content) throw new Error("O conteúdo da Academy não foi persistido.");
  return { studyId: study.id, contentId: content.id };
}

function studioUrl(studyId: string, contentId: string, type: "document" | "presentation" = "document") {
  return `/academy/studio?estudo=${encodeURIComponent(studyId)}&conteudo=${encodeURIComponent(contentId)}&tipo=${type}`;
}

function editorRegion(page: Page) {
  return page.locator('section[aria-label="Editor"]');
}

function sidebarRegion(page: Page) {
  return page.locator('aside[aria-label="Painel do Studio"]');
}

function previewRegion(page: Page) {
  return page.locator('section[aria-label="Pré-visualização"]');
}

test("o Studio sanitiza HTML e Markdown antes de renderizar o conteúdo", () => {
  const html = markdownToSafeHtml("Texto **seguro**\n\n<script>alert('xss')</script>\n\n<img src=x onerror=\"alert(1)\">");
  expect(html).toContain("seguro");
  expect(html).not.toContain("script");
  expect(html).not.toContain("onerror");
  expect(sanitizeHtml('<a href="javascript:alert(1)">link</a>')).not.toContain("javascript:");
  expect(toPlainText("## Título\n\n- Item **A**\n\n`código`")).toBe("Título\n\nItem A\n\ncódigo");
});

test("o Studio cria o documento a partir do conteúdo da Academy e o persiste", async ({ page }) => {
  const { studyId, contentId } = await createAcademyStudy(page);

  await page.goto(studioUrl(studyId, contentId));
  await expect(editorRegion(page)).toBeVisible();

  const documents = await readIndexedDBStore<StudioDocument>(page, "studio-documents");
  expect(documents).toHaveLength(1);
  expect(documents[0]).toMatchObject({ studyId, contentId, type: "document", template: "academic", status: "draft" });
  expect(documents[0].documentStructure?.title).toBe("Dashboard React na prática");
  const sections = documents[0].documentStructure?.sections ?? [];
  expect(sections.length).toBeGreaterThan(4);
  expect(sections.map((section) => section.title)).toEqual(
    expect.arrayContaining(["Componentes e estado", "Objetivo", "Conceitos principais", "Exercícios", "Resumo"]),
  );
  expect(sections.find((section) => section.type === "example")?.content).toContain("Um card de métrica reutilizável");
});

test("o Studio recupera o documento já salvo sem criar cópias duplicadas", async ({ page }) => {
  const { studyId, contentId } = await createAcademyStudy(page);
  await page.goto(studioUrl(studyId, contentId));
  await expect(editorRegion(page)).toBeVisible();

  await page.reload();
  await expect(editorRegion(page)).toBeVisible();
  expect(await readIndexedDBStore<StudioDocument>(page, "studio-documents")).toHaveLength(1);

  await page.goto("/academy/studio");
  await expect(page.getByRole("heading", { name: "Documentos do Studio" })).toBeVisible();
  await expect(page.getByText("1 documento salvo")).toBeVisible();
  await page.getByRole("button", { name: "Reabrir no Studio" }).click();
  await expect(editorRegion(page)).toBeVisible();
  expect(await readIndexedDBStore<StudioDocument>(page, "studio-documents")).toHaveLength(1);
});

test("o Studio edita a seção, reordena e desfaz e refaz a alteração", async ({ page }) => {
  const { studyId, contentId } = await createAcademyStudy(page);
  await page.goto(studioUrl(studyId, contentId));
  await expect(editorRegion(page)).toBeVisible();

  const editor = editorRegion(page);
  const content = editor.getByPlaceholder("Escreva o conteúdo da seção (Markdown permitido)");
  await expect(content).toBeVisible();
  await content.fill("Conteúdo revisado pelo aluno no Studio.");
  await content.blur();
  await expect
    .poll(async () => {
      const documents = await readIndexedDBStore<StudioDocument>(page, "studio-documents");
      return documents[0]?.documentStructure?.sections[0]?.content;
    })
    .toBe("Conteúdo revisado pelo aluno no Studio.");

  // Reordena a segunda seção para a primeira posição.
  const sidebar = sidebarRegion(page);
  const before = (await readIndexedDBStore<StudioDocument>(page, "studio-documents"))[0].documentStructure?.sections.map((section) => section.title) ?? [];
  await sidebar.getByRole("button", { name: "Mover seção 2 para cima" }).click();
  await expect
    .poll(async () => (await readIndexedDBStore<StudioDocument>(page, "studio-documents"))[0].documentStructure?.sections[0]?.title)
    .toBe(before[1]);

  await page.getByRole("button", { name: "Desfazer" }).click();
  await expect
    .poll(async () => (await readIndexedDBStore<StudioDocument>(page, "studio-documents"))[0].documentStructure?.sections[0]?.title)
    .toBe(before[0]);

  await page.getByRole("button", { name: "Refazer" }).click();
  await expect
    .poll(async () => (await readIndexedDBStore<StudioDocument>(page, "studio-documents"))[0].documentStructure?.sections[0]?.title)
    .toBe(before[1]);
});

test("o Studio troca o template preservando o conteúdo original", async ({ page }) => {
  const { studyId, contentId } = await createAcademyStudy(page);
  await page.goto(studioUrl(studyId, contentId));
  await expect(editorRegion(page)).toBeVisible();

  const sidebar = sidebarRegion(page);
  await sidebar.getByRole("tab", { name: "Templates" }).click();
  await sidebar.getByRole("button", { name: /Minimalista/ }).first().click();

  await expect
    .poll(async () => (await readIndexedDBStore<StudioDocument>(page, "studio-documents"))[0]?.template)
    .toBe("minimalist");

  const document = (await readIndexedDBStore<StudioDocument>(page, "studio-documents"))[0];
  expect(document.documentStructure?.sections.length).toBeGreaterThan(4);
  expect(document.documentStructure?.sections[0]?.content).toContain("React utiliza componentes");
  expect(document.customization.colorScheme).toBe("default");
});

test("o Studio cria apresentação e permite editar, duplicar e excluir slides", async ({ page }) => {
  const { studyId, contentId } = await createAcademyStudy(page);
  await page.goto(studioUrl(studyId, contentId, "presentation"));
  await expect(editorRegion(page)).toBeVisible();

  const documents = await readIndexedDBStore<StudioDocument>(page, "studio-documents");
  expect(documents).toHaveLength(1);
  expect(documents[0].type).toBe("presentation");
  const slides = documents[0].slides ?? [];
  expect(slides.length).toBeGreaterThanOrEqual(4);
  expect(slides[0].layout).toBe("cover");

  const editor = editorRegion(page);
  await editor.getByLabel("Título do slide").fill("Abertura revisada");
  await editor.getByLabel("Título do slide").blur();
  await expect
    .poll(async () => (await readIndexedDBStore<StudioDocument>(page, "studio-documents"))[0]?.slides?.[0]?.title)
    .toBe("Abertura revisada");

  const sidebar = sidebarRegion(page);
  await sidebar.getByRole("button", { name: "Duplicar slide 1" }).click();
  await expect
    .poll(async () => (await readIndexedDBStore<StudioDocument>(page, "studio-documents"))[0]?.slides?.length)
    .toBe(slides.length + 1);

  await sidebar.getByRole("button", { name: "Excluir slide 1" }).click();
  await expect
    .poll(async () => (await readIndexedDBStore<StudioDocument>(page, "studio-documents"))[0]?.slides?.length)
    .toBe(slides.length);
});

test("o Studio salva automaticamente e recupera o trabalho após recarregar", async ({ page }) => {
  const { studyId, contentId } = await createAcademyStudy(page);
  await page.goto(studioUrl(studyId, contentId));
  await expect(editorRegion(page)).toBeVisible();

  const editor = editorRegion(page);
  await editor.getByPlaceholder("Escreva o conteúdo da seção (Markdown permitido)").fill("Trabalho salvo automaticamente.");
  await editor.getByPlaceholder("Escreva o conteúdo da seção (Markdown permitido)").blur();
  await expect(page.getByText("Alterações pendentes")).toBeVisible();
  await expect(page.getByText("Alterações pendentes")).toBeHidden({ timeout: 15_000 });

  const documents = await readIndexedDBStore<StudioDocument>(page, "studio-documents");
  expect(documents[0].documentStructure?.sections[0]?.content).toBe("Trabalho salvo automaticamente.");
  expect(documents[0].version).toBeGreaterThan(1);

  await page.reload();
  await expect(editorRegion(page)).toBeVisible();
  await expect(editor.getByPlaceholder("Escreva o conteúdo da seção (Markdown permitido)")).toHaveValue("Trabalho salvo automaticamente.");
  expect(await readIndexedDBStore<StudioDocument>(page, "studio-documents")).toHaveLength(1);
});

test("a Biblioteca abre o material da Academy no Studio", async ({ page }) => {
  const { studyId, contentId } = await createAcademyStudy(page);

  await page.goto("/biblioteca");
  const card = page.getByRole("article", { name: "Dashboard React na prática" }).first();
  await expect(card).toBeVisible();
  await expect(card.getByRole("link", { name: "Abrir no Studio" })).toHaveAttribute("href", studioUrl(studyId, contentId));
});

test("o Studio abre o estudo da Academy no Workspace", async ({ page }) => {
  const { studyId, contentId } = await createAcademyStudy(page);
  await page.goto(studioUrl(studyId, contentId));
  await expect(editorRegion(page)).toBeVisible();

  await page.getByRole("button", { name: "Abrir no Workspace" }).click();
  await expect(page).toHaveURL(/\/estudo/, { timeout: 20_000 });
});

test("a assistência por IA do Studio propõe a alteração antes de aplicá-la", async ({ page }) => {
  const requests: Array<Record<string, unknown>> = [];
  await page.route("**/api/academy/studio/assist", async (route) => {
    requests.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        originalText: "React utiliza componentes.",
        suggestedText: "React utiliza componentes de forma declarativa.",
        explanation: "Sugestão gerada pela IA para \"improve-writing\".",
        action: "improve-writing",
      }),
    });
  });

  const { studyId, contentId } = await createAcademyStudy(page);
  await page.goto(studioUrl(studyId, contentId));
  await expect(editorRegion(page)).toBeVisible();

  const sidebar = sidebarRegion(page);
  await sidebar.getByRole("tab", { name: "Assistência por IA" }).click();
  await sidebar.getByRole("button", { name: /Melhorar redação/ }).click();

  await expect(sidebar.getByText("Proposta da IA")).toBeVisible();
  await expect(sidebar.getByText("React utiliza componentes de forma declarativa.")).toBeVisible();
  expect(requests[0]).toMatchObject({ action: "improve-writing" });

  // A proposta ainda não alterou o documento.
  const before = (await readIndexedDBStore<StudioDocument>(page, "studio-documents"))[0].documentStructure?.sections[0]?.content;
  expect(before).toBe("React utiliza componentes. O estado controla os dados exibidos e depende das interações do usuário.");

  await sidebar.getByRole("button", { name: "Aplicar sugestão" }).click();
  await expect
    .poll(async () => (await readIndexedDBStore<StudioDocument>(page, "studio-documents"))[0]?.documentStructure?.sections[0]?.content)
    .toBe("React utiliza componentes de forma declarativa.");
});

test("a prévia do Studio reflete o conteúdo editado", async ({ page }) => {
  const { studyId, contentId } = await createAcademyStudy(page);
  await page.goto(studioUrl(studyId, contentId));
  await expect(editorRegion(page)).toBeVisible();

  const editor = editorRegion(page);
  await editor.getByPlaceholder("Escreva o conteúdo da seção (Markdown permitido)").fill("Prévia atualizada do Studio.");
  await editor.getByPlaceholder("Escreva o conteúdo da seção (Markdown permitido)").blur();

  const preview = previewRegion(page);
  await preview.getByRole("button", { name: "Próxima página" }).click();
  await expect(preview).toContainText("Sumário");
  await preview.getByRole("button", { name: "Próxima página" }).click();
  await expect(preview).toContainText("Prévia atualizada do Studio.");
  await expect(preview).toContainText("Componentes e estado");
});

test("o Studio permanece utilizável no celular", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  const { studyId, contentId } = await createAcademyStudy(page);
  await page.goto(studioUrl(studyId, contentId));
  await expect(editorRegion(page)).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole("tab", { name: "Prévia" }).click();
  await expect(previewRegion(page)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole("tab", { name: "Organizar" }).click();
  await expect(sidebarRegion(page)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.goto("/academy/studio");
  await expect(page.getByRole("heading", { name: "Editor visual de materiais" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
