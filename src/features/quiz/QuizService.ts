import type { QuizDifficulty, QuizQuestion, QuizResult } from "@/types/quiz";
import { readLocalStorage, writeLocalStorage } from "@/lib/local-storage";

const STORAGE_KEY = "studyai:quizzes";
const UPDATE_EVENT = "studyai:quiz-updated";
type GeneratedQuestion = Pick<QuizQuestion, "question" | "alternatives" | "correctAnswer" | "explanation" | "difficulty">;
type QuizStore = { questions: QuizQuestion[]; results: QuizResult[] };

function isDifficulty(value: unknown): value is QuizDifficulty {
  return value === "easy" || value === "medium" || value === "hard";
}

function isQuestion(value: unknown): value is QuizQuestion {
  if (typeof value !== "object" || value === null) return false;
  const question = value as Partial<QuizQuestion>;
  return typeof question.id === "string" && typeof question.studyId === "string" &&
    typeof question.question === "string" && Array.isArray(question.alternatives) &&
    question.alternatives.every((alternative) => typeof alternative === "string") &&
    typeof question.correctAnswer === "number" && typeof question.explanation === "string" &&
    isDifficulty(question.difficulty) && typeof question.createdAt === "string";
}

function isResult(value: unknown): value is QuizResult {
  if (typeof value !== "object" || value === null) return false;
  const result = value as Partial<QuizResult>;
  return typeof result.id === "string" && typeof result.studyId === "string" &&
    Array.isArray(result.questionIds) && result.questionIds.every((id) => typeof id === "string") &&
    typeof result.correctAnswers === "number" && typeof result.wrongAnswers === "number" &&
    typeof result.score === "number" && typeof result.createdAt === "string" &&
    typeof result.completedAt === "string";
}

function isStore(value: unknown): value is QuizStore {
  if (typeof value !== "object" || value === null) return false;
  const store = value as { questions?: unknown; results?: unknown };
  return Array.isArray(store.questions) && store.questions.every(isQuestion) &&
    Array.isArray(store.results) && store.results.every(isResult);
}

export const QuizService = {
  load(): QuizStore {
    return readLocalStorage(STORAGE_KEY, isStore) ?? { questions: [], results: [] };
  },

  save(store: QuizStore) {
    writeLocalStorage(STORAGE_KEY, store, UPDATE_EVENT);
  },

  createQuestions(studyId: string, questions: readonly GeneratedQuestion[], now = new Date().toISOString()): QuizQuestion[] {
    return questions.map((question) => ({
      ...question,
      id: `quiz-question-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      studyId,
      createdAt: now,
    }));
  },

  createResult(studyId: string, questionIds: string[], correctAnswers: number, wrongAnswers: number, now = new Date().toISOString()): QuizResult {
    const total = correctAnswers + wrongAnswers;
    return {
      id: `quiz-result-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      studyId,
      questionIds,
      correctAnswers,
      wrongAnswers,
      score: total ? Math.round((correctAnswers / total) * 100) : 0,
      createdAt: now,
      completedAt: now,
    };
  },

  async requestGeneration({ studyId, title, subject }: { studyId: string; title: string; subject: string }) {
    const response = await fetch("/api/tutor/quiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studyId, title, subject }),
    });
    const data = await response.json().catch(() => null) as { questions?: GeneratedQuestion[]; error?: string } | null;
    if (!response.ok || !data?.questions) {
      throw new Error(data?.error ?? "Não foi possível criar o quiz agora.");
    }
    return data.questions;
  },
};
