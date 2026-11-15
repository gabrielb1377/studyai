export type ErrorSource = "quiz" | "flashcard" | "exam_material" | "manual";

export type ErrorReviewStatus = "pending" | "reviewed" | "resolved";

export type ErrorNotebookEntry = {
  id: string;
  dedupeKey: string;
  studyId?: string;
  studyTitle: string;
  subject: string;
  topic: string;
  source: ErrorSource;
  sourceId?: string;
  questionPrompt: string;
  wrongAnswer: string;
  correctAnswer?: string;
  explanation?: string;
  occurrences: number;
  status: ErrorReviewStatus;
  reviewCount: number;
  createdAt: string;
  lastOccurredAt: string;
  lastReviewedAt?: string;
  sourceUnavailable?: boolean;
};

export type CreateErrorEntryInput = {
  dedupeKey?: string;
  studyId?: string;
  studyTitle?: string;
  subject?: string;
  topic?: string;
  source: ErrorSource;
  sourceId?: string;
  questionPrompt: string;
  wrongAnswer: string;
  correctAnswer?: string;
  explanation?: string;
  occurredAt?: string;
};
