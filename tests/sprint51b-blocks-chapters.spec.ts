import { expect, test, type Page } from "@playwright/test";
import type { AcademyStudy } from "../src/features/academy/types";
import type { StudioDocument } from "../src/features/academy/studio/types";
import { STUDIO_INSERTABLE_BLOCKS, createSectionDraftForKind } from "../src/features/academy/studio/service";
import { readIndexedDBStore } from "./helpers/indexed-db";

const generationResponses = {
  outline: {
    title: "Árvores Binárias na Prática",
    objective: "Compreender nós, subárvores e travessias.",
    prerequisites: ["Recursão"],
    modules: [
      {
        id: "module-1",
        title: "Fundamentos",
        objective: "Modelar nós",
        estimatedMinutes: 30,
        order: 0,
        status: "not-started",
        progress: 0,
        chapterIds: [],
      },
    ],
    nextSteps: ["Implementar travessia em ordem"],
  },
  lessons: {
    chapters: [
      {
        id: "chapter-1",
        title: "Conceitos de Árvores Binárias",
        objective: "Definir raiz e folhas",
        content: "Cada nó possui no máximo dois filhos: esquerdo e direito.",
        concepts: ["Raiz", "Folha"],
        examples: ["Árvore de expressão aritmética"],
      },
      {
        id: "chapter-2",
        title: "Travessias Clássicas",
        objective: "Percorrer pré-ordem, em-ordem e pós-ordem",
        content: "As travessias visitam todos os nós recursivamente.",
        concepts: ["In-order", "Pre-order"],
        examples: ["Impressão ordenada em BST"],
      },
    ],
    concepts: [
      { name: "Raiz", description: "Nó inicial da árvore.", relatedTo: ["Folha"] },
      { name: "Folha", description: "Nó sem filhos.", relatedTo: ["Raiz"] },
    ],
    examples: ["Árvore de expressão"],
    summary: "Árvores binárias organizam dados hierarquicamente.",
    review: ["Qual a diferença entre pré-ordem e em-ordem?"],
  },
  practice: {
    exercises: [
      {
        id: "exercise-1",
        type: "conceptual",
        question: "Qual a altura mínima de uma árvore com 7 nós?",
        guidance: "Considere uma árvore completa.",
        answer: "Altura 2 (ou 3 níveis).",
        difficulty: "easy",
      },
    ],
    studyPlan: ["Revisar conceitos", "Resolver exercício"],
    flashcards: [{ question: "O que é folha?", answer: "Nó sem filhos.", difficulty: "easy" }],
    quiz: [
      {
        question: "Quantos filhos no máximo tem um nó binário?",
        alternatives: ["2", "3", "1", "Ilimitado"],
        correctAnswer: 0,
        explanation: "Pela definição de árvore binária, no máximo 2 filhos.",
        difficulty: "easy",
      },
    ],
  },
};

async function createAiAcademyStudy(page: Page) {
  await page.route("**/api/academy/generate", async (route) => {
    const body = route.request().postDataJSON() as { stage: "outline" | "lessons" | "practice" };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        stage: body.stage,
        data: generationResponses[body.stage],
        provider: "gemini",
        model: "gemini-test",
        usage: { inputTokens: 100, outputTokens: 200 },
        cached: false,
      }),
    });
  });

  await page.goto("/academy");
  await page.getByRole("button", { name: "Criar estudo livre" }).click();
  await page.getByRole("textbox", { name: "Tema", exact: true }).fill("Árvores Binárias");
  await page.getByRole("textbox", { name: "Matéria", exact: true }).fill("Estruturas de Dados");
  await page.getByRole("button", { name: "Criar estudo", exact: true }).click();
  await page.getByRole("button", { name: "Gerar", exact: true }).click();
  await page.getByRole("button", { name: "Gerar conteúdo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Abrir conteúdo" })).toBeVisible();

  const academy = await readIndexedDBStore<AcademyStudy>(page, "academy");
  const study = academy[0];
  const content = study?.contents[0];
  if (!study || !content) throw new Error("Conteúdo gerado por IA não encontrado.");
  return { study, content };
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

test("catálogo de blocos tipados expõe todos os 10 tipos solicitados na Sprint 51B", () => {
  const labels = STUDIO_INSERTABLE_BLOCKS.map((item) => item.label);
  expect(labels).toEqual(
    expect.arrayContaining([
      "Capítulo / Título",
      "Parágrafo",
      "Lista",
      "Resumo",
      "Exercício",
      "Exemplo",
      "Código",
      "Tabela",
      "Citação",
      "Diagrama",
    ]),
  );

  const chapterDraft = createSectionDraftForKind("chapter");
  expect(chapterDraft).toEqual({
    type: "heading",
    title: "Novo capítulo",
    content: "",
    level: 1,
  });

  const subsectionDraft = createSectionDraftForKind("heading");
  expect(subsectionDraft).toEqual({
    type: "heading",
    title: "Nova subseção",
    content: "",
    level: 2,
  });
});

test("insere capítulo, resumo e exercício abaixo de bloco, reordena, recolhe/expande capítulos, navega e atualiza Preview/Sumário", async ({
  page,
}) => {
  await page.goto("/academy");
  await page.getByRole("button", { name: "Criar estudo livre" }).click();
  await page.getByRole("textbox", { name: "Tema", exact: true }).fill("Sistemas Distribuídos e Consenso");
  await page.getByRole("textbox", { name: "Matéria", exact: true }).fill("Computação Distribuída");
  await page.getByRole("button", { name: "Criar estudo", exact: true }).click();

  await page.getByRole("link", { name: "Editar no Studio" }).click();
  await expect(page).toHaveURL(/\/academy\/studio\?estudo=/);

  const editor = editorRegion(page);
  const sidebar = sidebarRegion(page);
  const preview = previewRegion(page);
  await expect(editor).toBeVisible();
  await expect(sidebar).toBeVisible();

  // Inicia pelo template "Documento em branco" (1 seção inicial: "Introdução") e a transforma no Capítulo 1.
  await editor.getByLabel("Template pedagógico").selectOption("blank-document");
  await expect
    .poll(async () => (await readIndexedDBStore<StudioDocument>(page, "studio-documents"))[0]?.documentStructure?.sections.length)
    .toBe(1);

  const activeTitleInput = editor.getByPlaceholder("Título da seção");
  await expect(activeTitleInput).toHaveValue("Introdução");
  await editor.getByLabel("Tipo da seção").selectOption("heading");
  await activeTitleInput.fill("Capítulo 1 — Fundamentos");
  await activeTitleInput.blur();

  // 1. Adicionar um novo capítulo ao final do documento.
  await editor.getByRole("button", { name: "Adicionar capítulo" }).click();
  await expect
    .poll(async () => (await readIndexedDBStore<StudioDocument>(page, "studio-documents"))[0]?.documentStructure?.sections.length)
    .toBe(2);

  // Renomeia o segundo capítulo recém-adicionado.
  await expect(activeTitleInput).toHaveValue("Novo capítulo");
  await activeTitleInput.fill("Capítulo 2 — Algoritmo Raft");
  await activeTitleInput.blur();

  // 2. Seleciona o primeiro capítulo ("Capítulo 1 — Fundamentos") pela barra lateral e insere Resumo e Exercício imediatamente abaixo dele.
  await sidebar.getByRole("button", { name: /Capítulo 1 — Fundamentos/ }).click();
  await expect(activeTitleInput).toHaveValue("Capítulo 1 — Fundamentos");

  // Insere Resumo abaixo do Capítulo 1 usando o botão rápido inline.
  await editor.getByRole("button", { name: "Inserir resumo abaixo" }).click();
  await expect
    .poll(async () =>
      (await readIndexedDBStore<StudioDocument>(page, "studio-documents"))[0]?.documentStructure?.sections.map(
        (s) => `${s.type}:${s.title}`,
      ),
    )
    .toEqual(["heading:Capítulo 1 — Fundamentos", "summary:Resumo", "heading:Capítulo 2 — Algoritmo Raft"]);

  // Com o bloco "Resumo" agora ativo, insere Exercício imediatamente abaixo dele usando o seletor inline.
  await editor.getByLabel("Tipo de bloco para inserir abaixo").selectOption("exercise");
  await editor.getByRole("button", { name: "Inserir abaixo", exact: true }).click();

  await expect
    .poll(async () =>
      (await readIndexedDBStore<StudioDocument>(page, "studio-documents"))[0]?.documentStructure?.sections.map(
        (s) => `${s.type}:${s.title}:${s.order}`,
      ),
    )
    .toEqual([
      "heading:Capítulo 1 — Fundamentos:0",
      "summary:Resumo:1",
      "exercise:Exercício:2",
      "heading:Capítulo 2 — Algoritmo Raft:3",
    ]);

  // Verifica IDs únicos.
  const storedAfterInsert = (await readIndexedDBStore<StudioDocument>(page, "studio-documents"))[0]!;
  const sectionIds = storedAfterInsert.documentStructure!.sections.map((s) => s.id);
  expect(new Set(sectionIds).size).toBe(4);

  // 3. Reordenar blocos: move "Exercício" (seção 3, índice 2) para cima, ficando antes de "Resumo".
  await sidebar.getByRole("button", { name: "Mover seção 3 para cima" }).click();
  await expect
    .poll(async () =>
      (await readIndexedDBStore<StudioDocument>(page, "studio-documents"))[0]?.documentStructure?.sections.map(
        (s) => `${s.type}:${s.title}:${s.order}`,
      ),
    )
    .toEqual([
      "heading:Capítulo 1 — Fundamentos:0",
      "exercise:Exercício:1",
      "summary:Resumo:2",
      "heading:Capítulo 2 — Algoritmo Raft:3",
    ]);

  // Verifica Undo/Redo após reordenação.
  await page.getByRole("button", { name: "Desfazer" }).click();
  await expect
    .poll(async () =>
      (await readIndexedDBStore<StudioDocument>(page, "studio-documents"))[0]?.documentStructure?.sections.map((s) => s.type),
    )
    .toEqual(["heading", "summary", "exercise", "heading"]);

  await page.getByRole("button", { name: "Refazer" }).click();
  await expect
    .poll(async () =>
      (await readIndexedDBStore<StudioDocument>(page, "studio-documents"))[0]?.documentStructure?.sections.map((s) => s.type),
    )
    .toEqual(["heading", "exercise", "summary", "heading"]);

  // 4. Recolher e expandir capítulos na barra lateral.
  // "Capítulo 1 — Fundamentos" tem 2 blocos filhos ("Exercício" e "Resumo").
  await expect(sidebar.getByText("Capítulo 1 · 2 blocos")).toBeVisible();
  await expect(sidebar.getByRole("button", { name: /Exercício/ })).toBeVisible();
  await expect(sidebar.getByRole("button", { name: /Resumo/ })).toBeVisible();

  // Seleciona o Capítulo 2 antes de recolher o Capítulo 1 para que nenhum filho do Capítulo 1 esteja ativo.
  await sidebar.getByRole("button", { name: /Capítulo 2 — Algoritmo Raft/ }).click();
  await expect(activeTitleInput).toHaveValue("Capítulo 2 — Algoritmo Raft");

  await sidebar.getByRole("button", { name: "Recolher capítulo 1" }).click();
  await expect(sidebar.getByRole("button", { name: /Exercício/ })).toHaveCount(0);
  await expect(sidebar.getByRole("button", { name: /Resumo/ })).toHaveCount(0);
  // O Capítulo 2 permanece visível na barra lateral.
  await expect(sidebar.getByRole("button", { name: /Capítulo 2 — Algoritmo Raft/ })).toBeVisible();

  await sidebar.getByRole("button", { name: "Expandir capítulo 1" }).click();
  await expect(sidebar.getByRole("button", { name: /Exercício/ })).toBeVisible();
  await expect(sidebar.getByRole("button", { name: /Resumo/ })).toBeVisible();

  // 5. Navegar pela barra lateral para um bloco filho e editar seu conteúdo.
  await sidebar.getByRole("button", { name: /Resumo/ }).click();
  await expect(activeTitleInput).toHaveValue("Resumo");
  const textarea = editor.getByPlaceholder("Escreva o conteúdo da seção (Markdown permitido)");
  await textarea.fill("Síntese sobre quórum de maioria e eleição de líder.");
  await textarea.blur();

  // Também adiciona uma subseção (heading nível 2) abaixo do Capítulo 2 para validar o Sumário hierárquico.
  await sidebar.getByRole("button", { name: /Capítulo 2 — Algoritmo Raft/ }).click();
  await editor.getByLabel("Tipo de bloco para inserir abaixo").selectOption("heading");
  await editor.getByRole("button", { name: "Inserir abaixo", exact: true }).click();
  await expect(activeTitleInput).toHaveValue("Nova subseção");
  await activeTitleInput.fill("2.1 Eleição de Líder");
  await activeTitleInput.blur();

  // 6. Verificar Preview e Sumário.
  // Na página 0 está a Capa; na página 1 está o Sumário.
  await preview.getByRole("button", { name: "Próxima página" }).click();
  await expect(preview.getByRole("heading", { name: "Sumário" })).toBeVisible();
  await expect(preview.getByText("Capítulo 1 — Fundamentos")).toBeVisible();
  await expect(preview.getByText("Capítulo 2 — Algoritmo Raft")).toBeVisible();
  await expect(preview.getByText("2.1 Eleição de Líder")).toBeVisible();
});

test("preserva documentos antigos gerados por IA, documentos sem capítulos e templates pedagógicos da 51A", async ({ page }) => {
  const seeded = await createAiAcademyStudy(page);

  await page.goto(`/academy/studio?estudo=${seeded.study.id}&conteudo=${seeded.content.id}&tipo=document`);
  const editor = editorRegion(page);
  const sidebar = sidebarRegion(page);
  await expect(editor).toBeVisible();
  await expect(sidebar).toBeVisible();

  // Documento gerado por IA possui 2 capítulos ("Conceitos de Árvores Binárias" e "Travessias Clássicas").
  await expect(sidebar.getByText("Cap. 1")).toBeVisible();
  await expect(sidebar.getByText("Cap. 2")).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "Recolher capítulo 1" })).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "Recolher capítulo 2" })).toBeVisible();

  // Aplica template pedagógico "Capítulo de apostila" da 51A e verifica que o capítulo continua funcional.
  await editor.getByLabel("Template pedagógico").selectOption("textbook-chapter");
  await expect
    .poll(async () => (await readIndexedDBStore<StudioDocument>(page, "studio-documents"))[0]?.pedagogicalTemplate)
    .toBe("textbook-chapter");
  await expect(sidebar.getByRole("button", { name: /1\. Contextualização do capítulo/ })).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "Recolher capítulo 1" })).toBeVisible();

  // Verifica preservação de documento sem capítulos: aplica "Lista de exercícios" (que possui apenas parágrafo, exercícios e resumo) e depois "Documento em branco".
  await editor.getByLabel("Template pedagógico").selectOption("exercise-list");
  await expect
    .poll(async () => (await readIndexedDBStore<StudioDocument>(page, "studio-documents"))[0]?.pedagogicalTemplate)
    .toBe("exercise-list");
  await expect(sidebar.getByRole("button", { name: /Orientações de resolução/ })).toBeVisible();
  await expect(sidebar.getByRole("button", { name: /Questão 1 — Conceitual/ })).toBeVisible();

  await editor.getByLabel("Template pedagógico").selectOption("blank-document");
  await expect
    .poll(async () => (await readIndexedDBStore<StudioDocument>(page, "studio-documents"))[0]?.documentStructure?.sections.length)
    .toBe(1);

  await editor.getByRole("button", { name: "Adicionar lista" }).click();

  await expect
    .poll(async () =>
      (await readIndexedDBStore<StudioDocument>(page, "studio-documents"))[0]?.documentStructure?.sections.map(
        (s) => `${s.type}:${s.title}`,
      ),
    )
    .toEqual(["paragraph:Introdução", "list:Lista"]);

  await expect(sidebar.getByRole("button", { name: /Introdução/ })).toBeVisible();
  await expect(sidebar.getByRole("button", { name: /Lista/ })).toBeVisible();

  // Permite adicionar um capítulo diretamente pela barra lateral em um documento sem capítulos.
  await sidebar.getByRole("button", { name: "Adicionar capítulo na estrutura" }).click();
  await expect
    .poll(async () =>
      (await readIndexedDBStore<StudioDocument>(page, "studio-documents"))[0]?.documentStructure?.sections.map(
        (s) => `${s.type}:${s.level}:${s.title}`,
      ),
    )
    .toEqual(["paragraph:1:Introdução", "list:2:Lista", "heading:1:Novo capítulo"]);
});
