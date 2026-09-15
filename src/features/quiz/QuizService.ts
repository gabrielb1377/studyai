import type { QuizDifficulty, QuizQuestion, QuizResult } from "@/types/quiz";
import { readLocalStorage, writeLocalStorage } from "@/lib/local-storage";
import { AIClient } from "@/features/ai/AIClient";
import { RetrievalPipeline } from "@/features/ai/RetrievalPipeline";

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
    const chunks = RetrievalPipeline.forStudy(studyId).chunks;
    if (chunks.length === 0) {
      throw new Error("Este estudo ainda não possui conteúdo real extraído para gerar um quiz.");
    }
    const data = await AIClient.request<{ questions?: GeneratedQuestion[] }>(
      "/api/tutor/quiz",
      { studyId, title, subject, chunks },
      "Não foi possível criar o quiz agora.",
    );
    if (!data.questions) throw new Error("O provider retornou questões inválidas.");
    return data.questions;
  },
};
