import type { QuizDifficulty, QuizQuestion, QuizResult } from "@/types/quiz";

const STORAGE_KEY = "studyai:quizzes";
type GeneratedQuestion = Pick<QuizQuestion, "question" | "alternatives" | "correctAnswer" | "explanation" | "difficulty">;

function isDifficulty(value: unknown): value is QuizDifficulty { return value === "easy" || value === "medium" || value === "hard"; }
function isStore(value: unknown): value is { questions: QuizQuestion[]; results: QuizResult[] } {
  if (typeof value !== "object" || value === null) return false;
  const store = value as { questions?: unknown; results?: unknown };
  return Array.isArray(store.questions) && Array.isArray(store.results);
}

export const QuizService = {
  load() {
    if (typeof window === "undefined") return { questions: [], results: [] };
    try { const value: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}"); return isStore(value) ? value : { questions: [], results: [] }; } catch { return { questions: [], results: [] }; }
  },
  save(store: { questions: QuizQuestion[]; results: QuizResult[] }) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    window.dispatchEvent(new Event("studyai:quiz-updated"));
  },
  createQuestions(studyId: string, questions: readonly GeneratedQuestion[], now = new Date().toISOString()): QuizQuestion[] {
    return questions.map((question) => ({ ...question, id: `quiz-question-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, studyId, createdAt: now }));
  },
  createResult(studyId: string, questionIds: string[], correctAnswers: number, wrongAnswers: number, now = new Date().toISOString()): QuizResult {
    const total = correctAnswers + wrongAnswers;
    return { id: `quiz-result-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, studyId, questionIds, correctAnswers, wrongAnswers, score: total ? Math.round((correctAnswers / total) * 100) : 0, createdAt: now, completedAt: now };
  },
  async requestGeneration({ studyId, title, subject }: { studyId: string; title: string; subject: string }) {
    const response = await fetch("/api/tutor/quiz", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studyId, title, subject }) });
    const data = await response.json().catch(() => null) as { questions?: GeneratedQuestion[]; error?: string } | null;
    if (!response.ok || !data?.questions) throw new Error(data?.error ?? "Não foi possível criar o quiz agora.");
    return data.questions;
  },
  isDifficulty,
};
