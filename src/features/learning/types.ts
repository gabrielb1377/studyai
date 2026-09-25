export type LearningActivityType =
  | "reading"
  | "tutor"
  | "quiz"
  | "flashcard"
  | "summary"
  | "note";

export type LearningActivity = {
  id: string;
  type: LearningActivityType;
  studyId: string;
  subject: string;
  topic: string;
  chapter?: string;
  occurredAt: string;
  durationMinutes: number;
  correctAnswers: number;
  wrongAnswers: number;
  score?: number;
};

export type LearningTopicMetrics = {
  studyId: string;
  subject: string;
  topic: string;
  timeMinutes: number;
  flashcardsAnswered: number;
  quizzesCompleted: number;
  correctAnswers: number;
  wrongAnswers: number;
  accessDates: string[];
  lastAccessedAt?: string;
};

export type LearningProfile = {
  id: "local-user";
  totalStudyMinutes: number;
  timeBySubject: Record<string, number>;
  topics: Record<string, LearningTopicMetrics>;
  flashcardsAnswered: number;
  quizzesCompleted: number;
  correctAnswers: number;
  wrongAnswers: number;
  averageScore: number;
  activeDates: string[];
  lastAccessedAt?: string;
  streak: number;
  activities: LearningActivity[];
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeClassification =
  | "difficult"
  | "forgotten"
  | "strong"
  | "never_studied"
  | "developing";

export type KnowledgeScore = {
  studyId: string;
  subject: string;
  topic: string;
  knowledge: number;
  confidence: number;
  mastery: "Iniciante" | "Intermediário" | "Avançado";
  classification: KnowledgeClassification;
  components: {
    quiz: number;
    flashcards: number;
    time: number;
    frequency: number;
    recency: number;
  };
};

export type StudyPriority = {
  studyId: string;
  title: string;
  score: number;
  level: "Alta" | "Média" | "Baixa";
  reasons: string[];
};

export type DailyPlanItemType = "flashcards" | "reading" | "quiz" | "tutor" | "summary";

export type DailyPlanItem = {
  id: string;
  type: DailyPlanItemType;
  studyId: string;
  title: string;
  description: string;
  completed: boolean;
  priority: StudyPriority["level"];
};

export type LearningStatistics = {
  activeDays: number;
  preferredHour: string;
  averageSessionMinutes: number;
  averageQuizScore: number;
  flashcardsAnswered: number;
  retention: number;
  heatmap: Array<{ date: string; minutes: number }>;
};

export type QuizInsight = {
  evolution: number;
  comparison: string;
  strengths: string[];
  weaknesses: string[];
  recommendation: string;
};
