import { expect, test, type Page } from "@playwright/test";
import { STORAGE_DATABASE_VERSION } from "../src/lib/storage/StorageVersion";
import { createRealStudy } from "./helpers/real-study";
import { readIndexedDBStore } from "./helpers/indexed-db";

async function putRecord(page: Page, storeName: string, record: unknown) {
  await page.evaluate(async ([name, value, version]) => new Promise<void>((resolve, reject) => {
    const scope = localStorage.getItem("studyai:storage-scope") || "guest";
    const databaseName = scope === "guest" ? "studyai-db" : `studyai-db:${scope}`;
    const request = indexedDB.open(databaseName, version as number);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction(name as string, "readwrite");
      transaction.objectStore(name as string).put(value);
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onerror = () => { database.close(); reject(transaction.error); };
    };
  }), [storeName, record, STORAGE_DATABASE_VERSION] as [string, unknown, number]);
}

function linkedExam(studyId: string, createdAt: string) {
  return {
    id: "exam-progress-browser",
    studyId,
    title: "Prova de Estruturas",
    discipline: "Algoritmos",
    examDate: "2026-12-01",
    subjects: [{ id: "subject-1", name: "Estruturas", priority: "high", completed: false }],
    materialIds: [],
    dailyMinutes: 60,
    createdAt,
    updatedAt: createdAt,
  };
}

test("Semana de Prova consolida registros reais e mantém contagem após reload", async ({ page }) => {
  const studyId = await createRealStudy(page);
  const studies = await readIndexedDBStore<Record<string, unknown>>(page, "studies");
  const currentStudy = studies.find((item) => item.studyId === studyId);
  if (!currentStudy) throw new Error("Estudo sintético não encontrado.");
  const examCreatedAt = "2026-01-01T10:00:00.000Z";
  const occurredAt = "2026-01-02T10:00:00.000Z";
  await putRecord(page, "studies", { ...currentStudy, progress: 45, status: "in_progress", updatedAt: occurredAt });
  await putRecord(page, "metadata", {
    key: "learning-profile:v1",
    updatedAt: occurredAt,
    value: {
      id: "local-user",
      totalStudyMinutes: 15,
      timeBySubject: { Algoritmos: 15 },
      topics: {},
      flashcardsAnswered: 1,
      quizzesCompleted: 1,
      correctAnswers: 4,
      wrongAnswers: 1,
      averageScore: 75,
      activeDates: ["2026-01-02"],
      streak: 1,
      activities: [
        { id: "reading-1", type: "reading", studyId, subject: "Algoritmos", topic: "Estruturas", occurredAt, durationMinutes: 15, correctAnswers: 0, wrongAnswers: 0 },
        { id: "flashcard-1", type: "flashcard", studyId, subject: "Algoritmos", topic: "Estruturas", occurredAt, durationMinutes: 0, correctAnswers: 1, wrongAnswers: 0 },
        { id: "quiz-learning-duplicate", type: "quiz", studyId, subject: "Algoritmos", topic: "Estruturas", occurredAt, durationMinutes: 0, correctAnswers: 3, wrongAnswers: 1, score: 75 },
      ],
      createdAt: examCreatedAt,
      updatedAt: occurredAt,
    },
  });
  await putRecord(page, "quizzes", {
    id: "quiz-result-1",
    kind: "result",
    studyId,
    questionIds: ["q1", "q2", "q3", "q4"],
    correctAnswers: 3,
    wrongAnswers: 1,
    score: 75,
    createdAt: occurredAt,
    completedAt: occurredAt,
  });
  await putRecord(page, "flashcards", {
    id: "card-1",
    studyId,
    question: "O que é uma estrutura?",
    answer: "Uma organização de dados.",
    difficulty: "easy",
    createdAt: examCreatedAt,
    updatedAt: occurredAt,
    correctAnswers: 1,
    wrongAnswers: 0,
    lastReviewedAt: occurredAt,
  });
  await page.evaluate((value) => localStorage.setItem("studyai:exams:offline-session", JSON.stringify([value])), linkedExam(studyId, examCreatedAt));

  await page.goto("/provas");
  const progress = page.locator('[aria-labelledby="exam-real-progress-title"]');
  await expect(progress.getByText("45%", { exact: true })).toBeVisible();
  await expect(progress.getByText("3", { exact: true })).toBeVisible();
  await expect(progress.getByText("1", { exact: true })).toHaveCount(1);
  await expect(progress.getByText("75%", { exact: true })).toBeVisible();
  await expect(progress).toContainText("3 acertos / 1 erros");
  await page.reload();
  await expect(progress.getByText("3", { exact: true })).toBeVisible();
  await expect(progress.getByText("75%", { exact: true })).toBeVisible();
});

test("estado vazio permanece explicativo e sem overflow no viewport mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/provas");
  const createdAt = new Date().toISOString();
  await page.evaluate((value) => localStorage.setItem("studyai:exams:offline-session", JSON.stringify([value])), linkedExam("study-removido", createdAt));
  await page.reload();

  await expect(page.getByText("Sem dados suficientes. Vincule um estudo ou material organizado desta conta para consolidar o progresso.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
