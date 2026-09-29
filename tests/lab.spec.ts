import { expect, test } from "@playwright/test";
import type { LabProject } from "../src/features/lab/types";
import type { LearningProfile } from "../src/features/learning/types";
import type { Material } from "../src/types/material";
import { readIndexedDBStore } from "./helpers/indexed-db";

async function createAcademyPractice(page: import("@playwright/test").Page) {
  await page.route("**/api/academy/generate", async (route) => {
    const body = route.request().postDataJSON() as { stage: "outline" | "lessons" | "practice" };
    const data = body.stage === "outline" ? {
      title: "JavaScript na prática", objective: "Praticar lógica com segurança.", prerequisites: ["Lógica"],
      modules: [{ id: "module-1", title: "Fundamentos", objective: "Praticar", estimatedMinutes: 20, order: 0, status: "not-started", progress: 0, chapterIds: [] }], nextSteps: ["Executar o exercício"],
    } : body.stage === "lessons" ? {
      chapters: [{ id: "chapter-1", title: "Saída", objective: "Produzir uma saída", content: "console.log exibe valores.", concepts: ["Saída"], examples: ["console.log(42)"] }],
      concepts: [{ name: "Saída", description: "Valor produzido pelo programa.", relatedTo: [] }], examples: ["console.log"], summary: "JavaScript pode produzir saídas no console.", review: ["Execute um exemplo"],
    } : {
      exercises: [{ id: "exercise-1", type: "code", question: "Mostre o número 42 no console.", guidance: "Use console.log.", answer: "42", difficulty: "easy" }], studyPlan: ["Praticar"],
      flashcards: [], quiz: [], project: { objective: "Praticar JavaScript", technologies: ["JavaScript"], requirements: ["Saída 42"], steps: ["Editar", "Executar"], challenges: [], checklist: ["Executado"], completionCriteria: ["Saída 42"] },
    };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ stage: body.stage, data, provider: "gemini", model: "test", usage: {}, cached: false }) });
  });
  await page.goto("/academy");
  await page.getByRole("button", { name: "Criar estudo livre" }).click();
  await page.getByRole("textbox", { name: "Tema", exact: true }).fill("JavaScript");
  await page.getByRole("textbox", { name: "Matéria", exact: true }).fill("Programação");
  await page.getByRole("button", { name: "Criar estudo", exact: true }).click();
  await page.getByRole("button", { name: "Gerar", exact: true }).click();
  await page.getByRole("radio", { name: /Projeto prático/ }).click();
  await page.getByRole("button", { name: "Gerar conteúdo", exact: true }).click();
  await page.getByRole("button", { name: "Abrir conteúdo" }).click();
}

test("Academy abre exercício no Lab, executa em sandbox, corrige e atualiza o Learning Engine", async ({ page }) => {
  await createAcademyPractice(page);
  await page.route("**/api/lab/review", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    provider: "gemini", model: "test", text: JSON.stringify({ correct: ["Uso correto do console.log"], incorrect: [], explanation: "A saída corresponde ao esperado.", improvement: "Mantenha a solução simples.", alternativeSolution: "console.log(6 * 7);", nextExercises: ["Mostre 84"], score: 100 }),
  }) }));
  const openLab = page.getByRole("link", { name: "Abrir no Lab" });
  await expect(openLab).toHaveAttribute("href", /\/lab\?academyStudyId=/);
  await openLab.click();
  await expect(page).toHaveURL(/\/lab\?academyStudyId=/);
  await expect(page.getByRole("heading", { name: "Laboratório", exact: true })).toBeVisible();
  await expect(page.getByText("Mostre o número 42 no console.", { exact: true }).first()).toBeVisible();

  const editor = page.getByRole("textbox", { name: "Código do exercício" });
  await editor.fill('console.log("42");');
  await page.getByRole("button", { name: "Executar", exact: true }).click();
  await expect(page.getByText("42", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Corrigir com IA" }).click();
  await expect(page.getByRole("heading", { name: "Correção do Professor" })).toBeVisible();
  await expect(page.getByText("100%", { exact: true })).toBeVisible();

  const terminal = page.getByRole("textbox", { name: "Comando do terminal simulado" });
  await terminal.fill("mkdir dados"); await page.getByRole("button", { name: "Executar comando" }).click();
  await terminal.fill("ls"); await page.getByRole("button", { name: "Executar comando" }).click();
  await expect(page.getByRole("region", { name: "Terminal simulado" })).toContainText("dados/");

  const projects = await readIndexedDBStore<LabProject>(page, "lab");
  expect(projects).toHaveLength(1);
  expect(projects[0]).toMatchObject({ academyStudyId: expect.any(String), attempts: 1, correctAttempts: 1, status: "in-progress" });
  expect(projects[0].feedback?.score).toBe(100);
  const materials = await readIndexedDBStore<Material>(page, "documents");
  expect(materials.some((item) => item.sourceType === "lab" && item.labProjectId === projects[0].id)).toBe(true);
  await expect.poll(async () => {
    const metadata = await readIndexedDBStore<{ key: string; value?: LearningProfile }>(page, "metadata");
    return metadata.find((item) => item.key === "learning-profile:v1")?.value?.activities.some((item) => item.type === "lab");
  }).toBe(true);

  await page.reload();
  await expect(page.getByRole("textbox", { name: "Código do exercício" })).toHaveValue('console.log("42");');

  await page.goto("/biblioteca");
  await page.getByRole("button", { name: "Laboratório", exact: true }).click();
  await expect(page.getByRole("article", { name: projects[0].title })).toBeVisible();
  await page.keyboard.press("Control+K");
  await page.getByRole("dialog").getByRole("textbox", { name: "Pesquisar páginas" }).fill("Mostre o número 42");
  await expect(page.getByRole("dialog").getByRole("link", { name: new RegExp(projects[0].title) })).toHaveAttribute("href", `/lab?exercise=${projects[0].id}`);
  await page.keyboard.press("Escape");

  await page.goto("/");
  await expect(page.getByText("Continuar prática")).toBeVisible();
  await expect(page.getByText(projects[0].title, { exact: true }).first()).toBeVisible();

  await page.goto(`/estudo?tema=${projects[0].studyId}&aba=lab`);
  await expect(page.getByRole("tab", { name: "Lab", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("textbox", { name: "Código do exercício" })).toHaveValue('console.log("42");');
});

test("SQLite/WASM, Markdown, Mermaid e HTML funcionam localmente", async ({ page }) => {
  await page.goto("/lab");
  await page.getByRole("button", { name: "Novo exercício" }).click();
  await page.getByRole("textbox", { name: "Título do exercício" }).fill("SQL local");
  await page.getByLabel("Linguagem inicial").selectOption("sql");
  await page.getByRole("button", { name: "Criar laboratório" }).click();
  await page.getByRole("button", { name: "Executar", exact: true }).click();
  await expect(page.getByRole("cell", { name: "Ana" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "80" })).toBeVisible();

  await page.getByLabel("Linguagem do Laboratório").selectOption("markdown");
  await expect(page.getByRole("heading", { name: "StudyAI Lab" })).toBeVisible();
  await page.getByLabel("Linguagem do Laboratório").selectOption("mermaid");
  await expect(page.getByText("Estudar", { exact: true })).toBeVisible();
  await expect(page.getByText("Receber feedback", { exact: true })).toBeVisible();
  await page.getByLabel("Linguagem do Laboratório").selectOption("html");
  await expect(page.frameLocator('iframe[title="Preview HTML isolado"]').getByRole("heading", { name: "StudyAI Lab" })).toBeVisible();
});

test("Lab é responsivo e bloqueia APIs externas na execução", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/lab");
  await page.getByRole("button", { name: "Novo exercício" }).click();
  await page.getByRole("textbox", { name: "Título do exercício" }).fill("Sandbox");
  await page.getByRole("button", { name: "Criar laboratório" }).click();
  await page.getByRole("textbox", { name: "Código do exercício" }).fill('fetch("https://example.com")');
  await page.getByRole("button", { name: "Executar", exact: true }).click();
  await expect(page.getByText("Acesso à rede, workers e imports externos não são permitidos no Laboratório.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
