import { expect, test } from "@playwright/test";
import { ExamService } from "../src/features/exam/ExamService";
import { detectExercises } from "../src/features/ocr/exercise-review";
import { createRealStudy } from "./helpers/real-study";
import { examQuestionCatalog } from "../src/features/exam/ExamQuestionCatalog";
import { disciplineKey } from "../src/features/tutor/services/DisciplineContext";
import type { Material } from "../src/types/material";
import type { ExtractedContent } from "../src/features/extraction/ExtractionTypes";
import { TextNormalizationService } from "../src/features/extraction/TextNormalizationService";
import { confirmedChoice, questionRevision } from "../src/features/exam/ExamAnswerKey";

const now = new Date(2026, 10, 11, 12);
const exam = ExamService.create({
  title: "P2",
  discipline: "Cálculo",
  examDate: "2026-11-11",
  dailyMinutes: 60,
  materialIds: [],
  subjects: [
    { id: "1", name: "Limites", priority: "low", completed: true },
    { id: "2", name: "Derivadas", priority: "high", completed: false },
  ],
}, now.toISOString());

test("agrupa assuntos no mesmo dia, mantém conclusão e respeita a ordem manual", () => {
  const plan = ExamService.generatePlan(exam, now);
  expect(plan.map(({ dayIndex, subjectName, completed, estimatedMinutes }) =>
    [dayIndex, subjectName, completed, estimatedMinutes])).toEqual([
    [1, "Derivadas", false, 30],
    [1, "Limites", true, 30],
  ]);
  expect(ExamService.generatePlan({ ...exam, manualOrder: true }, now).map(({ subjectName }) => subjectName))
    .toEqual(["Limites", "Derivadas"]);
});

test("datas passadas e planos vazios não geram atividades fictícias", () => {
  expect(ExamService.generatePlan({ ...exam, examDate: "2026-11-10" }, now)).toEqual([]);
  expect(ExamService.generatePlan({ ...exam, subjects: [] }, now)).toEqual([]);
  expect(ExamService.generatePlan({ ...exam, examDate: "2026-11-12" }, now).map(({ dayIndex }) => dayIndex))
    .toEqual([1, 2]);
});

test("exercício preserva página e alternativas sem interpretar gabarito", () => {
  expect(detectExercises("Questão 1. Qual é a derivada de x?\nA) 1\nB) 0\nGabarito: A", 7)).toEqual([{
    page: 7, number: "1", firstLine: 1, lastLine: 3,
    statement: "Qual é a derivada de x?",
    alternatives: [{ label: "A", text: "1" }, { label: "B", text: "0" }],
  }]);
});

test("catálogo de PDF misto mantém a página original e aguarda revisão do OCR", () => {
  const material = { id: "mixed", name: "misto.pdf", studyId: "study-a", course: "Curso", semester: "1", subject: "Cálculo" } as Material;
  const text = TextNormalizationService.normalize("Questão 1. Qual é a derivada de x?\nA) 1\nB) 0");
  const record = {
    fileId: material.id, status: "extracted", metadata: {},
    pages: [
      { page: 1, method: "native", status: "ready", text, edited: false },
      { page: 2, method: "ocr", status: "ready", text, edited: false },
      { page: 3, method: "ocr", status: "ready", text, edited: true },
      { page: 4, method: "native", status: "ready", text: "Questão 1. Qual é a derivada de x? A) 1 B) 0", edited: false },
    ],
  } as ExtractedContent;
  const before = JSON.stringify(record);
  const catalog = examQuestionCatalog([material], [record], disciplineKey(material)!);
  expect(catalog.map(({ page, materialId, materialName, alternatives }) => ({ page, materialId, materialName, alternatives }))).toEqual(
    [1, 3].map((page) => ({ page, materialId: "mixed", materialName: "misto.pdf", alternatives: ["1", "0"] })),
  );
  expect(JSON.stringify(record)).toBe(before);
});

test("catálogo e tentativa rejeitam outra disciplina, material não selecionado e quantidade insuficiente", () => {
  const first = { id: "a", name: "A", studyId: "study-a", course: "Curso", semester: "1", subject: "Cálculo" } as Material;
  const other = { ...first, id: "b", subject: "Álgebra" };
  const unselected = { ...first, id: "c" };
  const records = [first, other, unselected].map(({ id }) => ({
    fileId: id, status: "extracted", metadata: {},
    extractedText: TextNormalizationService.normalize("Questão 1. Qual é a derivada de x?\nA) 1\nB) 0\nGabarito: A"),
  } as ExtractedContent));
  const key = disciplineKey(first)!;
  const catalog = examQuestionCatalog([first, other, unselected], records, key);
  expect(catalog.map(({ materialId }) => materialId)).toEqual(["a", "c"]);
  const preparation = { ...exam, disciplineKey: key, materialIds: ["a"] };
  expect(ExamService.startMaterialAttempt(preparation, catalog, 2)).toBeNull();
  const attempt = ExamService.startMaterialAttempt(preparation, catalog, 1);
  expect(attempt).toMatchObject({ examId: exam.id, disciplineKey: key, source: "material", answers: {} });
  expect(attempt?.questions[0]).toMatchObject({ materialId: "a", studyId: "study-a" });
  expect(attempt?.questions[0]).not.toHaveProperty("correctAnswer");
  if (!attempt) throw new Error("Tentativa esperada");
  const question = attempt.questions[0];
  expect(confirmedChoice(attempt, question, question)).toBeUndefined();
  attempt.confirmedKeys = { [question.id]: { choice: 0, source: "student-document",
    confirmedAt: now.toISOString(), revision: questionRevision(question) } };
  expect(confirmedChoice(attempt, question, question)).toBe(0);
  expect(confirmedChoice(attempt, question, { ...question, alternatives: [...question.alternatives].reverse() })).toBeUndefined();
  expect(confirmedChoice(attempt, question)).toBeUndefined();
});

test("duas avaliações do mesmo estudo mantêm tentativas e materiais separados após reload", async ({ page }) => {
  await createRealStudy(page, "Questão 1. Qual estrutura usa índices?\nA) Vetor\nB) Pilha\nGabarito: A");
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/provas");
  const create = async (title: string) => {
    await page.getByRole("button", { name: "Nova Prova", exact: true }).click();
    await page.getByLabel("Disciplina da Biblioteca").selectOption({ label: "Algoritmos · Ciência da Computação · 1º semestre" });
    await page.getByLabel("Nome da Prova").fill(title);
    await page.getByLabel("Data da Prova").fill("2026-12-01");
    await page.getByLabel("Horário da prova (opcional)").fill("14:30");
    await page.getByLabel("Assuntos / Conteúdos da Prova").fill("Estruturas de dados");
    await page.getByRole("button", { name: "Adicionar", exact: true }).click();
    await page.getByRole("button", { name: "Salvar Prova", exact: true }).click();
  };
  await create("Primeira avaliação");
  await page.getByRole("button", { name: "Adicionar material fundamentos.txt" }).click();
  const simulation = page.getByRole("region", { name: "Simulado dos materiais" });
  await expect(simulation.getByText("1 questões disponíveis nos materiais vinculados.")).toBeVisible();
  await expect(simulation.getByRole("button", { name: "Iniciar simulado dos materiais" })).toBeDisabled();
  const finish = async (answer: string) => {
    await simulation.getByLabel("Quantidade de questões").fill("1");
    await simulation.getByRole("button", { name: "Iniciar simulado dos materiais" }).click();
    await simulation.getByRole("radio", { name: answer }).check();
    await simulation.getByRole("button", { name: "Finalizar simulado dos materiais" }).click();
  };
  await finish("A. Vetor");
  await expect(simulation.getByText(/1 respondidas.*1 sem correção/)).toBeVisible();
  await expect(simulation.getByText(/Sugestão da extração: A/)).toBeVisible();
  await simulation.getByLabel("Autoavaliação da questão 1").selectOption("correct");
  await create("Segunda avaliação");
  await expect(page.getByText(/Nenhum material vinculado/)).toBeVisible();
  await expect(simulation.getByLabel("Histórico desta avaliação")).toHaveCount(0);
  await page.getByRole("button", { name: "Adicionar material fundamentos.txt" }).click();
  await finish("B. Pilha");
  await expect(simulation.getByText(/0 acertos declarados.*1 sem correção/)).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /Primeira avaliação/ }).click();
  await expect(page.getByText(/às 14:30/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Remover material fundamentos.txt" })).toBeVisible();
  await expect(simulation.getByRole("radio", { name: "A. Vetor" })).toBeChecked();
  await expect(simulation.getByText(/1 acertos declarados.*0 sem correção/)).toBeVisible();
  await simulation.getByLabel("Gabarito da questão 1 conferido por mim no documento").selectOption("0");
  await expect(simulation.getByText(/Gabarito conferido: 1 acertos e 0 erros/)).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /Primeira avaliação/ }).click();
  await expect(simulation.getByText(/Gabarito conferido: 1 acertos e 0 erros/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});
