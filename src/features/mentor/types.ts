import type { KnowledgeScore, StudyPriority } from "@/features/learning/types";

export type MentorLevel = KnowledgeScore["mastery"];
export type MentorGoalType = "exam" | "assignment" | "review" | "time";
export type MentorGoalStatus = "active" | "completed";

export type MentorGoal = {
  id: string;
  studyId?: string;
  title: string;
  type: MentorGoalType;
  targetAt?: string;
  targetMinutes?: number;
  progress: number;
  status: MentorGoalStatus;
  createdAt: string;
  updatedAt: string;
};

export type MentorStepType = "review" | "reading" | "flashcards" | "quiz" | "question";
export type MentorStepStatus = "pending" | "active" | "completed";

export type MentorPlanStep = {
  id: string;
  type: MentorStepType;
  title: string;
  description: string;
  estimatedMinutes: number;
  status: MentorStepStatus;
};

export type MentorQuestion = {
  id: string;
  prompt: string;
  concept: string;
  explanation: string;
  expectedKeywords: string[];
  difficulty: MentorLevel;
  source?: { fileId: string; document: string; page?: number; chapter?: string };
};

export type MentorEvaluation = {
  score: number;
  result: "correct" | "partial" | "incorrect";
  why: string;
  improvement: string;
  reviewTarget: string;
  followUpQuestion?: string;
  evaluatedAt: string;
};

export type MentorTurn = {
  id: string;
  question: MentorQuestion;
  answer?: string;
  evaluation?: MentorEvaluation;
  mentorExplanation?: string;
  provider?: string;
  model?: string;
  createdAt: string;
};

export type MentorSession = {
  id: string;
  studyId: string;
  subject: string;
  topic: string;
  status: "active" | "paused" | "completed";
  level: MentorLevel;
  knowledge: number;
  priority: StudyPriority;
  plan: MentorPlanStep[];
  currentStepIndex: number;
  turns: MentorTurn[];
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type MentorRecommendation = {
  id: string;
  studyId: string;
  type: "review" | "practice" | "reading" | "goal" | "progress";
  title: string;
  reason: string;
  action: MentorStepType;
  priority: StudyPriority["level"];
  createdAt: string;
};

export type MentorSnapshot = {
  goals: MentorGoal[];
  sessions: MentorSession[];
  recommendations: MentorRecommendation[];
  updatedAt: string;
};
