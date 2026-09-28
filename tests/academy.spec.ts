import { expect, test } from "@playwright/test";
import type { LearningProfile } from "../src/features/learning/types";
import type { AcademyStudy } from "../src/features/academy/types";
import type { Material } from "../src/types/material";
import type { StudyRecord } from "../src/types/study-engine";
import { readIndexedDBStore } from "./helpers/indexed-db";

test("cria e persiste um estudo livre integrado à Biblioteca e ao Learning Engine", async ({ page }) => {
  await page.goto("/academy");
  await expect(page.getByRole("heading", { name: "Academy", exact: true })).toBeVisible();
  await expect(page.getByText("Seu primeiro estudo livre começa aqui")).toBeVisible();

  await page.getByRole("button", { name: "Criar estudo livre" }).click();
  await page.getByRole("textbox", { name: "Tema", exact: true }).fill("Árvores binárias");
  await page.getByRole("textbox", { name: "Matéria", exact: true }).fill("Estruturas de Dados");
  await page.getByLabel("Nível").selectOption("intermediate");
  await page.getByLabel("Objetivo").selectOption("exam");
  await page.getByLabel("Duração").selectOption("60");
  await page.getByLabel("Profundidade").selectOption("deep");
  await page.getByLabel("Estilo").selectOption("practical");
  await page.getByRole("button", { name: "Criar estudo", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Árvores binárias" })).toBeVisible();
  await expect(page.getByText("Estruturas de Dados")).toBeVisible();
  await expect(page.getByText("60 min")).toBeVisible();

  const academy = await readIndexedDBStore<AcademyStudy>(page, "academy");
  expect(academy).toHaveLength(1);
  expect(academy[0]).toMatchObject({
    topic: "Árvores binárias",
    subject: "Estruturas de Dados",
    level: "intermediate",
    goal: "exam",
    duration: 60,
    sourceType: "ai-generated",
    modules: [],
    progress: 0,
  });

  const materials = await readIndexedDBStore<Material>(page, "documents");
  expect(materials).toHaveLength(1);
  expect(materials[0]).toMatchObject({ sourceType: "ai-generated", academyStudyId: academy[0].id, studyId: academy[0].id });

  const studies = await readIndexedDBStore<StudyRecord>(page, "studies");
  expect(studies).toHaveLength(1);
  expect(studies[0]).toMatchObject({ studyId: academy[0].id, title: "Árvores binárias", progress: 0, readingTimeMinutes: 60 });

  const metadata = await readIndexedDBStore<{ key: string; value?: LearningProfile }>(page, "metadata");
  const learning = metadata.find((record) => record.key === "learning-profile:v1")?.value;
  expect(learning?.topics[academy[0].id]).toMatchObject({
    topic: "Árvores binárias",
    subject: "Estruturas de Dados",
    goal: "exam",
    estimatedMinutes: 60,
    progress: 0,
  });

  await page.reload();
  await expect(page.getByRole("heading", { name: "Árvores binárias" })).toBeVisible();

  await page.goto("/biblioteca");
  const materialCard = page.getByRole("article", { name: "Árvores binárias" });
  await expect(materialCard.getByText("Material Gerado por IA")).toBeVisible();
  await expect(materialCard.getByRole("link", { name: "Abrir estudo" })).toHaveAttribute("href", `/academy?estudo=${academy[0].id}`);
});

test("Academy mantém o fluxo de criação utilizável no celular", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/academy");
  await page.getByRole("button", { name: "Criar estudo livre" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("gera projeto Academy e integra conteúdo, Biblioteca, estudo, grafo e atividades", async ({ page }) => {
  await page.route("**/api/academy/generate", async (route) => {
    const body = route.request().postDataJSON() as { stage: "outline" | "lessons" | "practice" };
    const responses = {
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
        quiz: [{ question: "Qual recurso controla dados mutáveis?", alternatives: ["Estado", "CSS", "HTML", "Rota"], correctAnswer: 0, explanation: "O estado mantém dados que mudam durante a interação.", difficulty: "easy" }],
        project: { objective: "Criar um dashboard", technologies: ["React", "TypeScript"], requirements: ["Cards de métricas"], steps: ["Modelar dados", "Criar componentes"], challenges: ["Adicionar filtros"], checklist: ["Interface responsiva"], completionCriteria: ["Dashboard funcional"] },
      },
    };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ stage: body.stage, data: responses[body.stage], provider: "gemini", model: "gemini-test", usage: { inputTokens: 100, outputTokens: 200 }, cached: false }) });
  });

  await page.goto("/academy");
  await page.getByRole("button", { name: "Criar estudo livre" }).click();
  await page.getByRole("textbox", { name: "Tema", exact: true }).fill("Dashboard com React");
  await page.getByRole("textbox", { name: "Matéria", exact: true }).fill("Desenvolvimento Web");
  await page.getByLabel("Objetivo").selectOption("practical-project");
  await page.getByRole("button", { name: "Criar estudo", exact: true }).click();
  await page.getByRole("button", { name: "Gerar", exact: true }).click();
  await page.getByRole("radio", { name: /Projeto prático/ }).click();
  await page.getByRole("button", { name: "Gerar conteúdo", exact: true }).click();

  await expect(page.getByRole("button", { name: "Abrir conteúdo" })).toBeVisible();
  await page.getByRole("button", { name: "Abrir conteúdo" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard React na prática" })).toBeVisible();
  await expect(page.getByText("Componentes e estado", { exact: true })).toBeVisible();
  await expect(page.getByText("1", { exact: true })).toHaveCount(4);

  const academy = await readIndexedDBStore<AcademyStudy>(page, "academy");
  expect(academy[0].contents).toHaveLength(1);
  expect(academy[0].contents[0]).toMatchObject({ kind: "practical-project", provider: "gemini", model: "gemini-test" });
  expect(academy[0].contents[0].project?.technologies).toContain("React");

  const documents = await readIndexedDBStore<Material>(page, "documents");
  expect(documents.map((material) => material.academyMaterialKind).sort()).toEqual(["exercise", "free-study", "practical-project", "summary"].sort());
  expect(await readIndexedDBStore(page, "contents")).toHaveLength(1);
  expect((await readIndexedDBStore(page, "chunks")).length).toBeGreaterThan(0);
  expect((await readIndexedDBStore(page, "embeddings")).length).toBeGreaterThan(0);
  expect(await readIndexedDBStore(page, "knowledge")).toHaveLength(1);
  expect(await readIndexedDBStore(page, "summaries")).toHaveLength(1);
  expect(await readIndexedDBStore(page, "flashcards")).toHaveLength(1);
  expect(await readIndexedDBStore(page, "quizzes")).toHaveLength(1);

  const metadata = await readIndexedDBStore<{ key: string; value?: LearningProfile }>(page, "metadata");
  const learning = metadata.find((record) => record.key === "learning-profile:v1")?.value;
  expect(learning?.topics[academy[0].id]).toMatchObject({ difficulty: "basic", knowledgeEstimate: 0 });
  expect(learning?.topics[academy[0].id].recommendedActivities).toHaveLength(3);

  await page.getByRole("button", { name: "Abrir no Professor" }).click();
  await expect(page).toHaveURL(/\/tutor\?modo=professor/);
  await expect(page.getByRole("button", { name: "Professor" })).toBeVisible();
});
