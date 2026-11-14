export type PlanningPriority = "high" | "medium" | "low";

export type PlanningFocus = "balanced" | "exams" | "reviews";

export type PlanningActivityKind =
  | "exam_prep"
  | "review"
  | "flashcards"
  | "practice_quiz"
  | "lab"
  | "tutor"
  | "study_reading";

export type StudyPlanItem = {
  id: string;
  dayOffset: number;
  dateStr: string;
  studyId?: string;
  studyTitle: string;
  subject: string;
  kind: PlanningActivityKind;
  title: string;
  reason: string;
  priority: PlanningPriority;
  priorityScore: number;
  estimatedMinutes: number;
  completed: boolean;
  completedAt?: string;
  examId?: string;
  examTitle?: string;
  targetHref: string;
  sourceUnavailable?: boolean;
};

export type StudyPlanConfig = {
  title: string;
  goal: string;
  dailyMinutes: number;
  horizonDays: number;
  includeExams: boolean;
  preferredFocus: PlanningFocus;
  selectedStudyIds: string[];
  manualStudyPriorities: Record<string, PlanningPriority>;
};

export type StudyPlan = StudyPlanConfig & {
  version: 1;
  id: string;
  items: StudyPlanItem[];
  createdAt: string;
  updatedAt: string;
};
