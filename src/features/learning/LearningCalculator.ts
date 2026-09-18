import type { Flashcard } from "@/types/flashcard";
import type { QuizResult } from "@/types/quiz";
import type { StudyRecord } from "@/types/study-engine";
import { KnowledgeEngine } from "./KnowledgeEngine";
import { ReviewScheduler } from "./ReviewScheduler";
import { StudyPriorityEngine } from "./StudyPriorityEngine";
import type { DailyPlanItem, LearningProfile, LearningStatistics } from "./types";

function localDate(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export const LearningCalculator = {
  streak(dates: readonly string[], now = new Date()) {
    const days = new Set(dates.map((date) => date.slice(0, 10)));
    const cursor = new Date(now);
    if (!days.has(localDate(cursor))) cursor.setDate(cursor.getDate() - 1);
    let streak = 0;
    while (days.has(localDate(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  },

  statistics(profile: LearningProfile, quizzes: readonly QuizResult[]): LearningStatistics {
    const readingSessions = profile.activities.filter((activity) => activity.durationMinutes > 0);
    const hours = profile.activities.reduce<Record<number, number>>((accumulator, activity) => {
      const hour = new Date(activity.occurredAt).getHours();
      accumulator[hour] = (accumulator[hour] ?? 0) + 1;
      return accumulator;
    }, {});
    const preferredHour = Object.entries(hours).sort(([, left], [, right]) => right - left)[0]?.[0];
    const flashcardReviews = profile.activities.filter((activity) => activity.type === "flashcard");
    const reviews = flashcardReviews.reduce((total, activity) => total + activity.correctAnswers + activity.wrongAnswers, 0);
    const retained = flashcardReviews.reduce((total, activity) => total + activity.correctAnswers, 0);
    const heatmap = Array.from({ length: 28 }, (_, offset) => {
      const date = new Date();
      date.setDate(date.getDate() - (27 - offset));
      const key = localDate(date);
      const minutes = profile.activities
        .filter((activity) => localDate(activity.occurredAt) === key)
        .reduce((total, activity) => total + activity.durationMinutes, 0);
      return { date: key, minutes: Number(minutes.toFixed(1)) };
    });
    return {
      activeDays: profile.activeDates.length,
      preferredHour: preferredHour === undefined ? "Ainda não identificado" : `${preferredHour.padStart(2, "0")}:00`,
      averageSessionMinutes: readingSessions.length
        ? Math.round(readingSessions.reduce((total, activity) => total + activity.durationMinutes, 0) / readingSessions.length)
        : 0,
      averageQuizScore: quizzes.length
        ? Math.round(quizzes.reduce((total, quiz) => total + quiz.score, 0) / quizzes.length)
        : 0,
      flashcardsAnswered: profile.flashcardsAnswered,
      retention: reviews ? Math.round(retained / reviews * 100) : 0,
      heatmap,
    };
  },

  dailyPlan(
    studies: readonly StudyRecord[],
    profile: LearningProfile,
    flashcards: readonly Flashcard[],
    quizzes: readonly QuizResult[],
    now = new Date(),
  ): DailyPlanItem[] {
    const priorities = studies.map((study) => {
      const knowledge = KnowledgeEngine.calculate(study, profile, flashcards, quizzes, now);
      return { study, knowledge, priority: StudyPriorityEngine.calculate(study, knowledge, profile, flashcards, now) };
    }).sort((left, right) => right.priority.score - left.priority.score);
    const today = localDate(now);
    const completedTypes = new Set(profile.activities
      .filter((activity) => localDate(activity.occurredAt) === today)
      .map((activity) => `${activity.studyId}:${activity.type}`));
    const items: DailyPlanItem[] = [];

    for (const { study, knowledge, priority } of priorities.slice(0, 3)) {
      const dueCards = flashcards.filter((card) => card.studyId === study.studyId && ReviewScheduler.isDue(card, now)).length;
      if (dueCards > 0) items.push({
        id: `${study.studyId}:flashcards`, type: "flashcards", studyId: study.studyId,
        title: `Revisar ${dueCards} flashcards`, description: study.title,
        completed: completedTypes.has(`${study.studyId}:flashcard`), priority: priority.level,
      });
      if (knowledge.classification === "never_studied" || knowledge.classification === "forgotten") items.push({
        id: `${study.studyId}:reading`, type: "reading", studyId: study.studyId,
        title: "Revisar o material", description: study.title,
        completed: completedTypes.has(`${study.studyId}:reading`), priority: priority.level,
      });
      if (knowledge.classification === "difficult") items.push({
        id: `${study.studyId}:tutor`, type: "tutor", studyId: study.studyId,
        title: "Conversar com o Tutor", description: `Peça outra explicação sobre ${study.title}`,
        completed: completedTypes.has(`${study.studyId}:tutor`), priority: priority.level,
      });
      if (!quizzes.some((quiz) => quiz.studyId === study.studyId) || priority.level === "Alta") items.push({
        id: `${study.studyId}:quiz`, type: "quiz", studyId: study.studyId,
        title: "Fazer um quiz", description: study.title,
        completed: completedTypes.has(`${study.studyId}:quiz`), priority: priority.level,
      });
      if (profile.activities.some((activity) => activity.studyId === study.studyId && activity.type === "summary")) items.push({
        id: `${study.studyId}:summary`, type: "summary", studyId: study.studyId,
        title: "Revisar o resumo", description: study.title,
        completed: completedTypes.has(`${study.studyId}:summary`), priority: priority.level,
      });
    }
    return items.slice(0, 5);
  },
};
