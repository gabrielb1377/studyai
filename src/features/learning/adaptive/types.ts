import type { QuizDifficulty, QuizQuestion, QuizResult } from "@/types/quiz";
import type { MaterialExamAttempt, MaterialExamQuestion } from "@/types/exam";
import type { Flashcard } from "@/types/flashcard";
import type { StudyRecord } from "@/types/study-engine";
import type { KnowledgeScore } from "@/features/learning/types";
import type { ErrorNotebookEntry } from "@/features/learning/errors/types";

export type AssessmentReliability = "insufficient" | "partial" | "reliable";

export type AdaptiveDifficultyMode = QuizDifficulty | "adaptive";

export type AdaptiveSelectionReason = {
  questionId: string;
  priorityScore: number;
  reasons: string[];
  errorMatched: boolean;
  difficulty: QuizDifficulty;
};

export type AdaptiveQuizSelectionResult = {
  selectedQuestions: QuizQuestion[];
  reasonsByQuestionId: Record<string, AdaptiveSelectionReason>;
  recommendedDifficulty: QuizDifficulty;
  prioritizedErrorCount: number;
  insufficientBank: boolean;
  summary: string;
};

export type AdaptiveMaterialSelectionResult = {
  selectedQuestions: MaterialExamQuestion[];
  prioritizedErrorCount: number;
  summary: string;
};

export type PostAssessmentReviewStep = {
  id: string;
  kind: "error_notebook" | "flashcards" | "tutor" | "adaptive_quiz";
  title: string;
  description: string;
  priority: "alta" | "media" | "baixa";
  href: string;
};

export type ReliableAssessmentIndicator = {
  studyId?: string;
  reliability: AssessmentReliability;
  reliabilityLabel: string;
  sampleSize: number;
  sessionsCount: number;
  accuracyPercent: number | null;
  evolutionDelta: number | null;
  pendingErrorsCount: number;
  dueFlashcardsCount: number;
  recommendedDifficulty: QuizDifficulty;
  disclaimer: string;
  nextReviewSteps: PostAssessmentReviewStep[];
};

export type AdaptiveQuizSelectionInput = {
  questions: readonly QuizQuestion[];
  results: readonly QuizResult[];
  errorEntries: readonly ErrorNotebookEntry[];
  knowledge?: KnowledgeScore;
  count: number;
  mode?: AdaptiveDifficultyMode;
};

export type AdaptiveMaterialSelectionInput = {
  questions: readonly MaterialExamQuestion[];
  errorEntries: readonly ErrorNotebookEntry[];
  attempts: readonly MaterialExamAttempt[];
  count: number;
};

export type ReliableIndicatorInput = {
  study?: StudyRecord;
  quizzes: readonly QuizResult[];
  flashcards: readonly Flashcard[];
  errorEntries: readonly ErrorNotebookEntry[];
  knowledge?: KnowledgeScore;
  now?: Date;
};
