export type ExamPriority = "high" | "medium" | "low";

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
  examDate: string;
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