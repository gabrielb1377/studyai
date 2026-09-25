import { expect, test } from "@playwright/test";
import { AnalyticsEngine } from "../src/features/analytics/AnalyticsEngine";
import { KnowledgeEngine } from "../src/features/learning/KnowledgeEngine";
import { createEmptyLearningProfile } from "../src/features/learning/LearningStorage";
import type { LearningProfile } from "../src/features/learning/types";
import type { Flashcard } from "../src/types/flashcard";
import type { QuizResult } from "../src/types/quiz";
import type { StudyRecord } from "../src/types/study-engine";
import { createRealStudy } from "./helpers/real-study";

const now = new Date("2026-09-24T20:00:00.000Z");
const study: StudyRecord = {
  studyId: "analytics-study", title: "Recursão", subject: "Algoritmos", materialIds: ["material-1"],
  status: "in_progress", progress: 50, createdAt: "2026-08-01T12:00:00.000Z", updatedAt: now.toISOString(), lastAccessedAt: now.toISOString(), readingTimeMinutes: 120,
  chapters: [{ id: "chapter-1", title: "Caso base", marker: "chapter", order: 0 }],
};
const flashcard: Flashcard = { id: "card", studyId: study.studyId, question: "Caso base?", answer: "Condição de parada", difficulty: "medium", createdAt: now.toISOString(), updatedAt: now.toISOString(), correctAnswers: 3, wrongAnswers: 1, nextReviewAt: "2026-09-27T12:00:00.000Z" };
const quiz: QuizResult = { id: "quiz", studyId: study.studyId, questionIds: ["q1"], correctAnswers: 4, wrongAnswers: 1, score: 80, createdAt: now.toISOString(), completedAt: now.toISOString() };

function profile(): LearningProfile {
  const base = createEmptyLearningProfile("2026-08-01T12:00:00.000Z");
  return {
    ...base,
    totalStudyMinutes: 90,
    timeBySubject: { Algoritmos: 90 },
    topics: { [study.studyId]: { studyId: study.studyId, subject: study.subject, topic: study.title, timeMinutes: 90, flashcardsAnswered: 4, quizzesCompleted: 1, correctAnswers: 7, wrongAnswers: 2, accessDates: ["2026-09-23", "2026-09-24"], lastAccessedAt: now.toISOString() } },
    activities: [
      { id: "a1", type: "reading", studyId: study.studyId, subject: study.subject, topic: study.title, chapter: "Caso base", occurredAt: now.toISOString(), durationMinutes: 60, correctAnswers: 0, wrongAnswers: 0 },
      { id: "a2", type: "quiz", studyId: study.studyId, subject: study.subject, topic: study.title, occurredAt: "2026-09-23T20:00:00.000Z", durationMinutes: 30, correctAnswers: 4, wrongAnswers: 1, score: 80 },
    ],
    activeDates: ["2026-09-23", "2026-09-24"], flashcardsAnswered: 4, quizzesCompleted: 1, correctAnswers: 7, wrongAnswers: 2, averageScore: 80, streak: 2, lastAccessedAt: now.toISOString(), updatedAt: now.toISOString(),
  };
}

test("Analytics calcula evolução, retenção, heatmap e previsões com dados registrados", () => {
  const learning = profile();
  const knowledge = [KnowledgeEngine.calculate(study, learning, [flashcard], [quiz], now)];
  const snapshot = AnalyticsEngine.build({ studies: [study], profile: learning, knowledge, flashcards: [flashcard], quizzes: [quiz], graphs: [], now });
  expect(snapshot.totalMinutes).toBe(90);
  expect(snapshot.weekly.at(-1)?.minutes).toBe(90);
  expect(snapshot.timeBySubject[0]).toMatchObject({ label: "Algoritmos", minutes: 90, percentage: 100 });
  expect(snapshot.timeByChapter[0]).toMatchObject({ label: "Caso base", minutes: 60 });
  expect(snapshot.retention.some((item) => item.scope === "subject")).toBe(true);
  expect(snapshot.forecast).toMatchObject({ remainingStudyMinutes: 60, reviewsNext7Days: 1 });
  expect(snapshot.heatmap).toHaveLength(84);
  expect(snapshot.timeline.some((item) => item.type === "quiz")).toBe(true);
});

test("Dashboard mostra Analytics e exporta relatórios CSV e PDF", async ({ page }) => {
  const studyId = await createRealStudy(page);
  await page.evaluate(async ({ id }) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("studyai-db", 2); request.onerror = () => reject(request.error); request.onsuccess = () => resolve(request.result); });
    const timestamp = new Date().toISOString();
    const value = {
      id: "local-user", totalStudyMinutes: 45, timeBySubject: { Algoritmos: 45 },
      topics: { [id]: { studyId: id, subject: "Algoritmos", topic: "Estruturas de dados", timeMinutes: 45, flashcardsAnswered: 0, quizzesCompleted: 0, correctAnswers: 0, wrongAnswers: 0, accessDates: [timestamp.slice(0, 10)], lastAccessedAt: timestamp } },
      flashcardsAnswered: 0, quizzesCompleted: 0, correctAnswers: 0, wrongAnswers: 0, averageScore: 0, activeDates: [timestamp.slice(0, 10)], lastAccessedAt: timestamp, streak: 1,
      activities: [{ id: "analytics-reading", type: "reading", studyId: id, subject: "Algoritmos", topic: "Estruturas de dados", occurredAt: timestamp, durationMinutes: 45, correctAnswers: 0, wrongAnswers: 0 }], createdAt: timestamp, updatedAt: timestamp,
    };
    await new Promise<void>((resolve, reject) => { const transaction = database.transaction("metadata", "readwrite"); transaction.objectStore("metadata").put({ key: "learning-profile:v1", value, updatedAt: timestamp }); transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
    database.close();
  }, { id: studyId });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Analytics de aprendizagem" })).toBeVisible();
  await expect(page.getByText("Evolução semanal", { exact: true })).toBeVisible();
  const csvDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV" }).click();
  expect((await csvDownload).suggestedFilename()).toBe("studyai-analytics.csv");
  const pdfDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "PDF" }).click();
  expect((await pdfDownload).suggestedFilename()).toBe("studyai-analytics.pdf");
});

