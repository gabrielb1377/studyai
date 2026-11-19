export type ExamPriority = "high" | "medium" | "low";

export type MaterialExamQuestion = {
  id: string;
  materialId: string;
  materialName: string;
  studyId?: string;
  page?: number;
  statement: string;
  alternatives: string[];
  suggestedChoice?: number;
};

export type MaterialExamAttempt = {
  id: string;
  examId: string;
  disciplineKey: string;
  source: "material";
  startedAt: string;
  completedAt?: string;
  questions: MaterialExamQuestion[];
  answers: Record<string, { choice: number; assessment?: "correct" | "wrong" }>;
  confirmedKeys?: Record<string, { choice: number; source: "student-document"; confirmedAt: string; revision: string }>;
};

export type ExamSubject = {
  id: string;
  name: string;
  priority: ExamPriority;
  completed: boolean;
};

export type Exam = {
  id: string;
  studyId?: string;
  title: string;
  discipline: string;
  disciplineKey?: string;
  examDate: string;
  examTime?: string;
  manualOrder?: boolean;
  materialAttempts?: MaterialExamAttempt[];
  practiceTotals?: { correct: number; wrong: number; reviewed: number };
  subjects: ExamSubject[];
  materialIds: string[];
  dailyMinutes: number;
  createdAt: string;
  updatedAt: string;
};

export type ExamPlanItem = {
  dayIndex: number;
  dateStr: string;
  subjectName: string;
  priority: ExamPriority;
  estimatedMinutes: number;
  completed: boolean;
};

export type ExamAttemptStatus = "created" | "in_progress" | "completed";

/**
 * Questão entregue ao navegador durante a prova: nunca inclui o gabarito
 * nem a explicação. Os campos sensíveis só existem no servidor e são
 * revelados pelo endpoint de correção após a entrega autorizada.
 */
export type SecureQuestion = {
  id: string;
  question: string;
  alternatives: string[];
  difficulty?: "easy" | "medium" | "hard";
};

/** Registro de tentativa devolvido ao cliente (sem gabarito). */
export type ExamAttemptRecord = {
  attemptId: string;
  status: ExamAttemptStatus;
  title?: string;
  questions: SecureQuestion[];
  totalCount: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  /** Presente somente depois de uma entrega autorizada. */
  result?: ExamAttemptResult;
};

/** Resultado devolvido somente depois da entrega autorizada. */
export type ExamAttemptResult = {
  attemptId: string;
  status: "completed";
  score: number;
  correctCount: number;
  totalCount: number;
  answers: number[];
  questions: Array<SecureQuestion & { correctAnswer: number; explanation: string }>;
  completedAt: string;
};
