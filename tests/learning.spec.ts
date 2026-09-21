import { expect, test } from "@playwright/test";
import { KnowledgeEngine } from "../src/features/learning/KnowledgeEngine";
import { LearningCalculator } from "../src/features/learning/LearningCalculator";
import { createEmptyLearningProfile } from "../src/features/learning/LearningStorage";
import { ReviewScheduler } from "../src/features/learning/ReviewScheduler";
import { StudyPriorityEngine } from "../src/features/learning/StudyPriorityEngine";
import type { LearningProfile } from "../src/features/learning/types";
import type { Flashcard } from "../src/types/flashcard";
import type { QuizResult } from "../src/types/quiz";
import type { StudyRecord } from "../src/types/study-engine";
import { createRealStudy } from "./helpers/real-study";
import { readIndexedDBStore } from "./helpers/indexed-db";

const now = new Date("2026-09-17T12:00:00.000Z");
const study: StudyRecord = {
  studyId: "study-vetores", title: "Vetores", subject: "Algoritmos", materialIds: ["material-1"],
  status: "in_progress", progress: 40, createdAt: now.toISOString(), updatedAt: now.toISOString(), lastAccessedAt: now.toISOString(),
};
const card: Flashcard = {
  id: "card-1", studyId: study.studyId, question: "O que é vetor?", answer: "Uma estrutura indexada.",
  difficulty: "medium", createdAt: now.toISOString(), updatedAt: now.toISOString(), correctAnswers: 4, wrongAnswers: 1,
};
const quiz: QuizResult = {
  id: "quiz-1", studyId: study.studyId, questionIds: ["question-1"], correctAnswers: 4, wrongAnswers: 1,
  score: 80, createdAt: now.toISOString(), completedAt: now.toISOString(),
};

function learnedProfile(): LearningProfile {
  return {
    ...createEmptyLearningProfile("2026-09-10T12:00:00.000Z"),
    totalStudyMinutes: 90,
    timeBySubject: { Algoritmos: 90 },
    topics: {
      [study.studyId]: {
        studyId: study.studyId, subject: study.subject, topic: study.title, timeMinutes: 90,
        flashcardsAnswered: 5, quizzesCompleted: 1, correctAnswers: 8, wrongAnswers: 2,
        accessDates: ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17"], lastAccessedAt: now.toISOString(),
      },
    },
    flashcardsAnswered: 5, quizzesCompleted: 1, correctAnswers: 8, wrongAnswers: 2, averageScore: 80,
    activeDates: ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17"], lastAccessedAt: now.toISOString(), streak: 4,
    updatedAt: now.toISOString(),
  };
}

test("Knowledge Score combina quiz, flashcards, tempo, frequência e recência", () => {
  const score = KnowledgeEngine.calculate(study, learnedProfile(), [card], [quiz], now);
  expect(score.knowledge).toBeGreaterThan(60);
  expect(score.confidence).toBeGreaterThan(30);
  expect(score.components).toMatchObject({ quiz: 80, flashcards: 80, recency: 100 });
  expect(score.mastery).not.toBe("Iniciante");
});

test("SM-2 agenda revisão e reinicia repetições após erro", () => {
  const first = ReviewScheduler.schedule(card, true, now);
  expect(first).toMatchObject({ repetitions: 1, reviewIntervalDays: 1, reviewAlgorithm: "sm2" });
  const second = ReviewScheduler.schedule({ ...card, ...first }, true, now);
  expect(second).toMatchObject({ repetitions: 2, reviewIntervalDays: 6 });
  const forgotten = ReviewScheduler.schedule({ ...card, ...second }, false, now);
  expect(forgotten).toMatchObject({ repetitions: 0, reviewIntervalDays: 1 });
  expect(forgotten.easeFactor).toBeGreaterThanOrEqual(1.3);
});

test("prioridade explica erros, recência e domínio", () => {
  const profile = learnedProfile();
  profile.topics[study.studyId] = { ...profile.topics[study.studyId], wrongAnswers: 3, lastAccessedAt: "2026-09-10T12:00:00.000Z" };
  const score = { ...KnowledgeEngine.calculate(study, profile, [card], [quiz], now), knowledge: 42 };
  const priority = StudyPriorityEngine.calculate(study, score, profile, [card], now);
  expect(priority.level).toBe("Alta");
  expect(priority.reasons.join(" ")).toContain("3 erros");
  expect(priority.reasons.join(" ")).toContain("7 dias");
  expect(priority.reasons.join(" ")).toContain("42% de conhecimento");
});

test("plano diário prioriza revisões e temas esquecidos", () => {
  const profile = learnedProfile();
  profile.topics[study.studyId] = { ...profile.topics[study.studyId], lastAccessedAt: "2026-08-20T12:00:00.000Z" };
  const dueCard = { ...card, lastReviewedAt: "2026-09-01T12:00:00.000Z", nextReviewAt: "2026-09-10T12:00:00.000Z" };
  const plan = LearningCalculator.dailyPlan([study], profile, [dueCard], [quiz], now);
  expect(plan.some((item) => item.type === "flashcards" && item.title.includes("1"))).toBe(true);
  expect(plan.some((item) => item.type === "reading")).toBe(true);
});

test("Dashboard apresenta plano, streak e sinais de aprendizagem", async ({ page }) => {
  await createRealStudy(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Hoje", exact: true })).toBeVisible();
  await expect(page.getByText("Plano diário", { exact: true })).toBeVisible();
  await expect(page.getByText("Streak", { exact: true })).toBeVisible();
  await expect(page.getByText("Nunca estudado", { exact: false })).toBeVisible();
});

test("Tutor recebe perfil adaptativo antes de responder", async ({ page }) => {
  const studyId = await createRealStudy(page);
  await page.evaluate(async ({ key, id }) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("studyai-db", 2); request.onerror = () => reject(request.error); request.onsuccess = () => resolve(request.result);
    });
    const nowValue = new Date().toISOString();
    const profile = {
      id: "local-user", totalStudyMinutes: 90, timeBySubject: { Algoritmos: 90 },
      topics: { [id]: { studyId: id, subject: "Algoritmos", topic: "Estruturas de dados", timeMinutes: 90, flashcardsAnswered: 0, quizzesCompleted: 0, correctAnswers: 0, wrongAnswers: 3, accessDates: [nowValue.slice(0, 10)], lastAccessedAt: nowValue } },
      flashcardsAnswered: 0, quizzesCompleted: 0, correctAnswers: 0, wrongAnswers: 3, averageScore: 0,
      activeDates: [nowValue.slice(0, 10)], lastAccessedAt: nowValue, streak: 1, activities: [], createdAt: nowValue, updatedAt: nowValue,
    };
    await new Promise<void>((resolve, reject) => { const transaction = database.transaction("metadata", "readwrite"); transaction.objectStore("metadata").put({ key, value: profile, updatedAt: nowValue }); transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
    database.close();
  }, { key: "learning-profile:v1", id: studyId });
  let adaptiveContext: { learning?: { classification: string; priority: string } } | undefined;
  await page.route("**/api/tutor", async (route) => {
    adaptiveContext = route.request().postDataJSON().context;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ model: "test", text: "Explicação adaptada." }) });
  });
  await page.goto("/tutor");
  await page.getByRole("button", { name: "Nova conversa" }).first().click();
  await page.getByLabel("Mensagem para o Tutor IA").fill("Explique novamente");
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByText("Explicação adaptada.", { exact: true })).toBeVisible();
  expect(adaptiveContext?.learning?.classification).toBe("difficult");
  expect(adaptiveContext?.learning?.priority).toBe("Alta");
});

test("Flashcard registra o agendamento SM-2 no armazenamento", async ({ page }) => {
  await page.route("**/api/tutor/flashcards", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ cards: [{ question: "Pergunta SM-2", answer: "Resposta", difficulty: "medium" }] }) }));
  const studyId = await createRealStudy(page);
  await page.goto(`/estudo?tema=${studyId}&aba=flashcards`);
  await page.getByRole("button", { name: "Criar flashcards" }).click();
  await page.getByRole("button", { name: "Mostrar resposta" }).click();
  await page.getByRole("button", { name: "Acertei" }).click();
  await expect(page.getByText("Próxima revisão em 1 dia", { exact: false })).toBeVisible();
  await expect.poll(async () => (await readIndexedDBStore<Flashcard>(page, "flashcards"))[0]?.repetitions).toBe(1);
  const cards = await readIndexedDBStore<Flashcard>(page, "flashcards");
  expect(cards[0]).toMatchObject({ reviewIntervalDays: 1, reviewAlgorithm: "sm2" });
  await expect.poll(async () => {
    const metadata = await readIndexedDBStore<{ key: string; value?: LearningProfile }>(page, "metadata");
    return metadata.find((item) => item.key === "learning-profile:v1")?.value?.flashcardsAnswered;
  }).toBe(1);
});

test("Quiz mostra evolução, pontos fortes ou fracos e recomendação", async ({ page }) => {
  const studyId = await createRealStudy(page);
  await page.evaluate(async ({ id }) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("studyai-db", 2); request.onerror = () => reject(request.error); request.onsuccess = () => resolve(request.result); });
    const transaction = database.transaction("quizzes", "readwrite");
    transaction.objectStore("quizzes").put({ id: "question-learning", studyId: id, question: "Como vetores armazenam elementos?", alternatives: ["Por índices", "Sem ordem", "Sem posição", "Somente texto"], correctAnswer: 0, explanation: "Usam índices.", difficulty: "easy", createdAt: new Date().toISOString(), kind: "question", _storageOrder: 0 });
    await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); }); database.close();
  }, { id: studyId });
  await page.goto(`/estudo?tema=${studyId}&aba=quiz`);
  await page.getByRole("button", { name: /A\. Por índices/ }).click();
  await page.getByRole("button", { name: "Finalizar" }).click();
  await expect(page.getByText("Quiz concluído", { exact: true })).toBeVisible();
  await expect(page.getByText("Evolução", { exact: true })).toBeVisible();
  await expect(page.getByText("Recomendação", { exact: true })).toBeVisible();
  await expect.poll(async () => {
    const metadata = await readIndexedDBStore<{ key: string; value?: LearningProfile }>(page, "metadata");
    return metadata.find((item) => item.key === "learning-profile:v1")?.value?.quizzesCompleted;
  }).toBe(1);
});
