import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { examLearningHref, resolveExamStudy } from "../src/features/exam/ExamLearningNavigation";
import type { Exam } from "../src/types/exam";
import type { StudyRecord } from "../src/types/study-engine";
import { createRealStudy } from "./helpers/real-study";
import { contentNeedsTutorReview } from "../src/features/ocr/exercise-review";

function loadTutorContextService(studies: readonly StudyRecord[]) {
  const source = readFileSync(path.join(process.cwd(), "src/features/tutor/services/TutorContextService.ts"), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiled = { exports: {} as Record<string, unknown> };
  const dependencies: Record<string, unknown> = {
    "@/features/learning/errors/ErrorNotebookStorage": {
      ErrorNotebookStorage: { load: async () => [], reconcileWithStudies: () => [] },
    },
    "@/features/learning/memory/LongTermMemoryStorage": {
      LongTermMemoryStorage: { load: async () => ({ entries: [] }), reconcileWithStudies: () => [] },
    },
    "@/features/learning/memory/MemoryRetrievalEngine": {
      MemoryRetrievalEngine: { selectForTutor: () => undefined },
    },
    "@/features/notes/NotesService": { NotesService: { load: async () => [] } },
    "@/features/study/services/StudyEngine": { StudyEngine: { load: async () => [...studies] } },
    "@/features/summaries/services/SummaryStorage": { SummaryStorage: { load: async () => [] } },
    "@/features/extraction/ContentStorage": { ContentStorage: { load: async () => ({ records: [] }) } },
    "@/features/ocr/exercise-review": { contentNeedsTutorReview },
    "@/features/flashcards/FlashcardService": { FlashcardService: { load: async () => [] } },
    "@/features/quiz/QuizService": { QuizService: { load: async () => ({ questions: [], results: [] }) } },
    "@/features/learning/KnowledgeEngine": { KnowledgeEngine: { calculate: () => ({ knowledge: 0, confidence: 0, mastery: 0, classification: "initial" }) } },
    "@/features/learning/LearningStorage": { LearningStorage: { load: async () => ({ topics: {} }) } },
    "@/features/learning/StudyPriorityEngine": { StudyPriorityEngine: { calculate: () => ({ level: "medium", reasons: [] }) } },
    "@/features/mentor/services/MentorStorage": { MentorStorage: { load: async () => ({ sessions: [], recommendations: [] }) } },
  };
  vm.runInNewContext(output, {
    module: compiled,
    exports: compiled.exports,
    require: (id: string) => dependencies[id] ?? (() => { throw new Error(`Dependência inesperada: ${id}`); })(),
    Promise,
  });
  return (compiled.exports.TutorContextService as { loadCurrent(studyId?: string): Promise<{ studyId: string } | null> });
}

function study(studyId: string): StudyRecord {
  return {
    studyId,
    title: `Estudo ${studyId}`,
    subject: "Algoritmos",
    materialIds: [],
    status: "in_progress",
    progress: 0,
    createdAt: "2026-11-08T12:00:00.000Z",
    updatedAt: "2026-11-08T12:00:00.000Z",
    lastAccessedAt: "2026-11-08T12:00:00.000Z",
  };
}

function exam(studyId?: string): Exam {
  return {
    id: "exam-41ic",
    studyId,
    title: "Prova de Algoritmos",
    discipline: "Algoritmos",
    examDate: "2026-12-01",
    subjects: [{ id: "subject-1", name: "Estruturas", priority: "high", completed: false }],
    materialIds: [],
    dailyMinutes: 60,
    createdAt: "2026-11-08T12:00:00.000Z",
    updatedAt: "2026-11-08T12:00:00.000Z",
  };
}

async function seedLinkedExam(page: Page, studyId: string) {
  await page.evaluate(({ linkedStudyId, linkedExam }) => {
    localStorage.setItem("studyai:exams:offline-session", JSON.stringify([{ ...linkedExam, studyId: linkedStudyId }]));
  }, { linkedStudyId: studyId, linkedExam: exam() });
}

test("rotas contextuais usam o studyId real e abrem o Modo Prova explicitamente", () => {
  expect(examLearningHref("study/seguro", "tutor")).toBe("/estudo?tema=study%2Fseguro&aba=ia");
  expect(examLearningHref("study-1", "flashcards")).toBe("/estudo?tema=study-1&aba=flashcards");
  expect(examLearningHref("study-1", "quiz")).toBe("/estudo?tema=study-1&aba=quiz");
  expect(examLearningHref("study-1", "exam")).toBe("/estudo?tema=study-1&aba=quiz&modo=exam");
});

test("studyId persistido não autoriza um estudo ausente do catálogo da sessão", () => {
  const studies = [study("study-a")];
  expect(resolveExamStudy(exam("study-a"), studies)?.studyId).toBe("study-a");
  expect(resolveExamStudy(exam("study-b"), studies)).toBeUndefined();
  expect(resolveExamStudy(exam(), studies)).toBeUndefined();
});

test("TutorContextService seleciona o estudo solicitado sem reutilizar o mais recente", async () => {
  const recent = { ...study("study-a"), lastAccessedAt: "2026-11-08T14:00:00.000Z" };
  const requested = { ...study("study-b"), lastAccessedAt: "2026-11-08T13:00:00.000Z" };
  const service = loadTutorContextService([recent, requested]);
  expect(await service.loadCurrent("study-b")).toMatchObject({ studyId: "study-b" });
  expect(await service.loadCurrent("study-inválido")).toBeNull();
});

test("Semana de Prova abre Tutor, Flashcards, Quiz e Simulado com contexto no desktop", async ({ page }) => {
  const studyId = await createRealStudy(page);
  const examId = "exam-41ic";
  await seedLinkedExam(page, studyId);
  await page.goto("/provas");

  await expect(page.getByRole("heading", { name: "Atividades desta prova" })).toBeVisible();
  await expect(page.locator(`a[href="${examLearningHref(studyId, "tutor", examId)}"]`)).toHaveCount(1);
  await expect(page.locator(`a[href="${examLearningHref(studyId, "flashcards", examId)}"]`)).toHaveCount(1);
  await expect(page.locator(`a[href="${examLearningHref(studyId, "quiz", examId)}"]`)).toHaveCount(1);
  await expect(page.locator(`a[href="${examLearningHref(studyId, "exam", examId)}"]`)).toHaveCount(2);

  await page.locator(`a[href="${examLearningHref(studyId, "tutor", examId)}"]`).click();
  await expect(page).toHaveURL(new RegExp(`tema=${studyId}.*aba=ia.*origem=provas.*prova=${examId}`));
  await expect(page.getByText("Utilizando contexto do tema atual")).toBeVisible();

  await page.goto(examLearningHref(studyId, "flashcards"));
  await expect(page.getByRole("heading", { name: "Flashcards", exact: true })).toBeVisible();

  await page.goto(examLearningHref(studyId, "quiz"));
  await expect(page.getByRole("heading", { name: "Simulado & Quiz Explicado" })).toBeVisible();
  await expect(page.getByLabel("Modo do simulado")).toHaveValue("practice");

  await page.goto(examLearningHref(studyId, "exam"));
  await expect(page.getByLabel("Modo do simulado")).toHaveValue("exam");
  await expect(page.getByText("Entre na sua conta para criar uma tentativa com correção no servidor e gabarito protegido.")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("correctAnswer");
});

test("ações permanecem funcionais no viewport mobile e após reload", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const studyId = await createRealStudy(page);
  await seedLinkedExam(page, studyId);
  await page.goto("/provas");
  await page.reload();

  await expect(page.getByRole("heading", { name: "Atividades desta prova" })).toBeVisible();
  await expect(page.locator(`a[href="${examLearningHref(studyId, "exam", "exam-41ic")}"]`).last()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("vínculo inválido é preservado sem produzir navegação autorizada", async ({ page }) => {
  await page.goto("/provas");
  await expect(page.getByRole("button", { name: "Nova Prova" })).toBeVisible();
  await page.evaluate((linkedExam) => {
    localStorage.setItem("studyai:exams:offline-session", JSON.stringify([linkedExam]));
  }, exam("study-removido"));
  await page.reload();

  await expect(page.getByText("O estudo vinculado não está disponível nesta conta. O vínculo foi preservado.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Indisponível" })).toHaveCount(4);
  const storedStudyId = await page.evaluate(() => JSON.parse(localStorage.getItem("studyai:exams:offline-session") ?? "[]")[0]?.studyId);
  expect(storedStudyId).toBe("study-removido");
});
