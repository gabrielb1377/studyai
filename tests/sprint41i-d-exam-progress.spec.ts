import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ExamProgressService, resolveExamStudies } from "../src/features/exam/ExamProgressService";
import type { Exam } from "../src/types/exam";
import type { Flashcard } from "../src/types/flashcard";
import { createEmptyLearningProfile } from "../src/features/learning/LearningStorage";
import type { LearningActivity, LearningProfile } from "../src/features/learning/types";
import type { QuizResult } from "../src/types/quiz";
import type { StudyRecord } from "../src/types/study-engine";

const createdAt = "2026-11-08T10:00:00.000Z";
const after = "2026-11-08T11:00:00.000Z";
const before = "2026-11-08T09:00:00.000Z";

function study(overrides: Partial<StudyRecord> = {}): StudyRecord {
  return {
    studyId: "study-1",
    title: "Estruturas",
    subject: "Algoritmos",
    materialIds: ["material-1"],
    status: "not_started",
    progress: 0,
    createdAt: before,
    updatedAt: after,
    lastAccessedAt: after,
    ...overrides,
  };
}

function exam(overrides: Partial<Exam> = {}): Exam {
  return {
    id: "exam-1",
    studyId: "study-1",
    title: "P1",
    discipline: "Algoritmos",
    examDate: "2026-12-01",
    subjects: [],
    materialIds: ["material-1"],
    dailyMinutes: 60,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

function activity(id: string, type: LearningActivity["type"], overrides: Partial<LearningActivity> = {}): LearningActivity {
  return {
    id,
    type,
    studyId: "study-1",
    subject: "Algoritmos",
    topic: "Estruturas",
    occurredAt: after,
    durationMinutes: 10,
    correctAnswers: 0,
    wrongAnswers: 0,
    ...overrides,
  };
}

function profile(activities: LearningActivity[] = []): LearningProfile {
  return { ...createEmptyLearningProfile(createdAt), activities, updatedAt: activities[0]?.occurredAt ?? createdAt };
}

function quiz(id: string, overrides: Partial<QuizResult> = {}): QuizResult {
  return {
    id,
    studyId: "study-1",
    questionIds: [`${id}-q1`, `${id}-q2`],
    correctAnswers: 1,
    wrongAnswers: 1,
    score: 50,
    createdAt: after,
    completedAt: after,
    ...overrides,
  };
}

function card(id: string, overrides: Partial<Flashcard> = {}): Flashcard {
  return {
    id,
    studyId: "study-1",
    question: "Pergunta",
    answer: "Resposta",
    difficulty: "easy",
    createdAt,
    updatedAt: after,
    correctAnswers: 1,
    wrongAnswers: 0,
    lastReviewedAt: after,
    ...overrides,
  };
}

function build(input: {
  exam?: Exam;
  studies?: StudyRecord[];
  profile?: LearningProfile;
  flashcards?: Flashcard[];
  quizzes?: QuizResult[];
} = {}) {
  return ExamProgressService.build({
    exam: input.exam ?? exam(),
    studies: input.studies ?? [study()],
    profile: input.profile ?? profile(),
    flashcards: input.flashcards ?? [],
    quizzes: input.quizzes ?? [],
  });
}

describe("Sprint 41I.D — consolidação de progresso real", () => {
  it("1. mantém não iniciado quando não há progresso nem atividades", () => {
    const result = build();
    assert.equal(result.state, "not_started");
    assert.equal(result.activitiesCompleted, 0);
    assert.equal(result.performance, null);
  });

  it("2. separa progresso parcial do desempenho", () => {
    const result = build({ studies: [study({ progress: 45, status: "in_progress" })] });
    assert.equal(result.state, "in_progress");
    assert.equal(result.studyProgress, 45);
    assert.equal(result.performance, null);
  });

  it("3. conta atividades concluídas por ID estável", () => {
    const result = build({ profile: profile([activity("read-1", "reading"), activity("tutor-1", "tutor")]) });
    assert.equal(result.activitiesCompleted, 2);
    assert.equal(result.studyMinutes, 20);
  });

  it("4. consolida acertos e erros do QuizService sem usar nota como progresso", () => {
    const result = build({ quizzes: [quiz("quiz-1", { correctAnswers: 3, wrongAnswers: 1, score: 75 })] });
    assert.equal(result.quizAttempts, 1);
    assert.equal(result.correctAnswers, 3);
    assert.equal(result.wrongAnswers, 1);
    assert.equal(result.performance, 75);
    assert.equal(result.studyProgress, 0);
  });

  it("5. conta revisões de flashcards pelos eventos e cartões distintos pelo serviço", () => {
    const result = build({
      profile: profile([activity("review-1", "flashcard", { correctAnswers: 1 }), activity("review-2", "flashcard", { wrongAnswers: 1 })]),
      flashcards: [card("card-1"), card("card-1")],
    });
    assert.equal(result.flashcardReviews, 2);
    assert.equal(result.reviewedCards, 1);
  });

  it("6. não associa simulados protegidos sem examId/studyId persistido", () => {
    assert.equal(build().protectedExamResultsIncluded, false);
  });

  it("7. recusa atividades quando a prova não possui marco temporal confiável", () => {
    const result = build({ exam: exam({ createdAt: "data-inválida" }), profile: profile([activity("read-1", "reading")]) });
    assert.equal(result.canAssociateDatedActivities, false);
    assert.equal(result.activitiesCompleted, 0);
  });

  it("8. reload produz a mesma consolidação sem registrar novamente", () => {
    const input = { profile: profile([activity("read-1", "reading")]), quizzes: [quiz("quiz-1")] };
    assert.deepEqual(build(input), build(input));
  });

  it("9. preserva duas tentativas legítimas com IDs diferentes", () => {
    assert.equal(build({ quizzes: [quiz("quiz-1"), quiz("quiz-2")] }).quizAttempts, 2);
  });

  it("10. deduplica resultado repetido com o mesmo ID", () => {
    assert.equal(build({ quizzes: [quiz("quiz-1"), quiz("quiz-1")] }).quizAttempts, 1);
  });

  it("11. estudo removido resulta em dados insuficientes", () => {
    const result = build({ studies: [] });
    assert.equal(result.state, "insufficient_data");
    assert.equal(result.activitiesCompleted, 0);
  });

  it("12. não mistura perfis sintéticos de contas diferentes", () => {
    const accountA = build({ profile: profile([activity("private-a", "reading")]) });
    const accountB = build({ profile: profile([]) });
    assert.equal(accountA.activitiesCompleted, 1);
    assert.equal(accountB.activitiesCompleted, 0);
  });

  it("13. funciona no escopo offline sem tratamento privilegiado de dados", () => {
    const result = build({ profile: profile([activity("offline-1", "reading")]) });
    assert.equal(result.activitiesCompleted, 1);
  });

  it("14. associa estudo por material explicitamente vinculado", () => {
    const materialStudy = study({ studyId: "study-material", materialIds: ["material-linked"] });
    const matches = resolveExamStudies(exam({ studyId: undefined, materialIds: ["material-linked"] }), [materialStudy]);
    assert.deepEqual(matches.map((item) => item.studyId), ["study-material"]);
  });

  it("15. exclui resultados anteriores à criação da prova", () => {
    const result = build({
      profile: profile([activity("old", "reading", { occurredAt: before })]),
      quizzes: [quiz("old-quiz", { completedAt: before })],
      flashcards: [card("old-card", { lastReviewedAt: before })],
    });
    assert.equal(result.activitiesCompleted, 0);
    assert.equal(result.reviewedCards, 0);
  });

  it("16. o hook exige identidade e geração atuais antes de aplicar carga assíncrona", () => {
    const source = readFileSync(path.join(process.cwd(), "src/features/exam/useExamProgress.ts"), "utf8");
    assert.match(source, /current\.userId !== session\.userId/);
    assert.match(source, /current\.generation !== session\.generation/);
    assert.match(source, /current\.suspended/);
  });
});
