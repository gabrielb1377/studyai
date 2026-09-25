import { StudyEngine } from "@/features/study/services/StudyEngine";
import { LearningCalculator } from "./LearningCalculator";
import { LearningStorage } from "./LearningStorage";
import type { LearningActivity, LearningActivityType, LearningProfile, LearningTopicMetrics } from "./types";

export type RecordLearningActivity = {
  type: LearningActivityType;
  studyId: string;
  chapter?: string;
  durationMinutes?: number;
  correctAnswers?: number;
  wrongAnswers?: number;
  score?: number;
  occurredAt?: string;
};

let writeQueue: Promise<void> = Promise.resolve();

function dateKey(value: string) {
  return value.slice(0, 10);
}

function round(value: number) {
  return Number(value.toFixed(2));
}

function updateTopic(current: LearningTopicMetrics | undefined, activity: LearningActivity): LearningTopicMetrics {
  return {
    studyId: activity.studyId,
    subject: activity.subject,
    topic: activity.topic,
    timeMinutes: round((current?.timeMinutes ?? 0) + activity.durationMinutes),
    flashcardsAnswered: (current?.flashcardsAnswered ?? 0) + (activity.type === "flashcard" ? 1 : 0),
    quizzesCompleted: (current?.quizzesCompleted ?? 0) + (activity.type === "quiz" ? 1 : 0),
    correctAnswers: (current?.correctAnswers ?? 0) + activity.correctAnswers,
    wrongAnswers: (current?.wrongAnswers ?? 0) + activity.wrongAnswers,
    accessDates: Array.from(new Set([...(current?.accessDates ?? []), dateKey(activity.occurredAt)])).sort(),
    lastAccessedAt: activity.occurredAt,
  };
}

function withActivity(profile: LearningProfile, activity: LearningActivity): LearningProfile {
  const activities = [activity, ...profile.activities].slice(0, 1_000);
  const activeDates = Array.from(new Set([...profile.activeDates, dateKey(activity.occurredAt)])).sort();
  const quizzesCompleted = profile.quizzesCompleted + (activity.type === "quiz" ? 1 : 0);
  const quizScores = activities.filter((item) => item.type === "quiz" && item.score !== undefined);
  return {
    ...profile,
    totalStudyMinutes: round(profile.totalStudyMinutes + activity.durationMinutes),
    timeBySubject: {
      ...profile.timeBySubject,
      [activity.subject]: round((profile.timeBySubject[activity.subject] ?? 0) + activity.durationMinutes),
    },
    topics: { ...profile.topics, [activity.studyId]: updateTopic(profile.topics[activity.studyId], activity) },
    flashcardsAnswered: profile.flashcardsAnswered + (activity.type === "flashcard" ? 1 : 0),
    quizzesCompleted,
    correctAnswers: profile.correctAnswers + activity.correctAnswers,
    wrongAnswers: profile.wrongAnswers + activity.wrongAnswers,
    averageScore: quizScores.length
      ? Math.round(quizScores.reduce((total, item) => total + (item.score ?? 0), 0) / quizScores.length)
      : profile.averageScore,
    activeDates,
    lastAccessedAt: activity.occurredAt,
    streak: LearningCalculator.streak(activeDates, new Date(activity.occurredAt)),
    activities,
    updatedAt: activity.occurredAt,
  };
}

export const LearningService = {
  async recordActivity(input: RecordLearningActivity) {
    let result: LearningProfile | undefined;
    writeQueue = writeQueue.catch(() => undefined).then(async () => {
      const [profile, studies] = await Promise.all([LearningStorage.load(), StudyEngine.load()]);
      const study = studies.find((item) => item.studyId === input.studyId);
      if (!study) { result = profile; return; }
      const occurredAt = input.occurredAt ?? new Date().toISOString();
      const activity: LearningActivity = {
        id: `learning-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: input.type,
        studyId: input.studyId,
        subject: study.subject,
        topic: study.title,
        chapter: input.chapter?.trim() || undefined,
        occurredAt,
        durationMinutes: Math.max(0, input.durationMinutes ?? 0),
        correctAnswers: Math.max(0, input.correctAnswers ?? 0),
        wrongAnswers: Math.max(0, input.wrongAnswers ?? 0),
        score: input.score,
      };
      result = withActivity(profile, activity);
      await LearningStorage.save(result);
    });
    await writeQueue;
    return result ?? LearningStorage.load();
  },

  enqueueActivity(input: RecordLearningActivity) {
    if (typeof window === "undefined") return;
    const run = () => { void this.recordActivity(input); };
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(run, { timeout: 1_500 });
    } else globalThis.setTimeout(run, 0);
  },
};
