import type { KnowledgeGraph } from "@/features/semantic/types";
import type { Flashcard } from "@/types/flashcard";
import type { QuizResult } from "@/types/quiz";
import type { StudyRecord } from "@/types/study-engine";
import type { KnowledgeScore, LearningProfile } from "@/features/learning/types";
import type { MentorSession } from "@/features/mentor/types";

export type AnalyticsPeriodPoint = {
  key: string;
  label: string;
  minutes: number;
  activities: number;
};

export type AnalyticsBreakdown = {
  id: string;
  label: string;
  minutes: number;
  percentage: number;
};

export type RetentionMetric = {
  id: string;
  label: string;
  scope: "subject" | "concept" | "chapter";
  value: number;
  evidence: number;
  estimated: boolean;
};

export type ForgettingStatus = "forgetting" | "stable" | "mastered";

export type ForgettingMetric = {
  studyId: string;
  subject: string;
  topic: string;
  retention: number;
  confidence: number;
  status: ForgettingStatus;
  lastActivityAt?: string;
  daysSinceActivity?: number;
};

export type AnalyticsInsight = {
  id: string;
  tone: "attention" | "positive" | "neutral";
  title: string;
  description: string;
};

export type AnalyticsTimelineItem = {
  id: string;
  type: "material" | "quiz" | "flashcard" | "session" | "mentor" | "tutor";
  title: string;
  description: string;
  occurredAt: string;
};

export type AnalyticsForecast = {
  remainingStudyMinutes: number;
  reviewsNext7Days: number;
  sessionsBySubject: AnalyticsBreakdown[];
};

export type PeriodComparison = {
  currentMinutes: number;
  previousMinutes: number;
  deltaPercent: number | null;
};

export type AnalyticsSnapshot = {
  generatedAt: string;
  totalMinutes: number;
  weekly: AnalyticsPeriodPoint[];
  monthly: AnalyticsPeriodPoint[];
  timeBySubject: AnalyticsBreakdown[];
  timeByTopic: AnalyticsBreakdown[];
  timeByChapter: AnalyticsBreakdown[];
  retention: RetentionMetric[];
  forgetting: ForgettingMetric[];
  forecast: AnalyticsForecast;
  insights: AnalyticsInsight[];
  timeline: AnalyticsTimelineItem[];
  heatmap: Array<{ date: string; minutes: number; activities: number; intensity: number }>;
  currentStreak: number;
  longestStreak: number;
  weekComparison: PeriodComparison;
  monthComparison: PeriodComparison;
};

export type AnalyticsInput = {
  studies: readonly StudyRecord[];
  profile: LearningProfile;
  knowledge: readonly KnowledgeScore[];
  flashcards: readonly Flashcard[];
  quizzes: readonly QuizResult[];
  graphs: readonly KnowledgeGraph[];
  mentorSessions?: readonly MentorSession[];
  now?: Date;
};

