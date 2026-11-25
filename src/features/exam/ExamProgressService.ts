import type { Exam } from "@/types/exam";
import type { Flashcard } from "@/types/flashcard";
import type { LearningActivity, LearningProfile } from "@/features/learning/types";
import type { QuizResult } from "@/types/quiz";
import type { StudyRecord, StudyStatus } from "@/types/study-engine";

export type ExamProgressState = StudyStatus | "insufficient_data";

export type ExamProgressSnapshot = {
  state: ExamProgressState;
  studies: Array<Pick<StudyRecord, "studyId" | "title" | "subject" | "progress" | "status">>;
  studyProgress: number | null;
  topicsStudied: number;
  activitiesCompleted: number;
  studyMinutes: number;
  flashcardReviews: number;
  reviewedCards: number;
  quizAttempts: number;
  correctAnswers: number;
  wrongAnswers: number;
  performance: number | null;
  canAssociateDatedActivities: boolean;
  protectedExamResultsIncluded: false;
};

type BuildExamProgressInput = {
  exam: Exam;
  studies: readonly StudyRecord[];
  profile: LearningProfile;
  flashcards: readonly Flashcard[];
  quizzes: readonly QuizResult[];
};

function uniqueById<T extends { id: string }>(items: readonly T[]) {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

function validTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function occurredAfter(value: string, cutoff: number) {
  const timestamp = validTimestamp(value);
  return timestamp !== null && timestamp >= cutoff;
}

export function resolveExamStudies(exam: Pick<Exam, "studyId" | "materialIds">, studies: readonly StudyRecord[]) {
  const materialIds = new Set(exam.materialIds);
  return studies.filter((study) =>
    study.studyId === exam.studyId || study.materialIds.some((materialId) => materialIds.has(materialId)),
  );
}

export const ExamProgressService = {
  build({ exam, studies, profile, flashcards, quizzes }: BuildExamProgressInput): ExamProgressSnapshot {
    const associatedStudies = resolveExamStudies(exam, studies);
    const studyIds = new Set(associatedStudies.map((study) => study.studyId));
    const cutoff = validTimestamp(exam.createdAt);
    const canAssociateDatedActivities = cutoff !== null;

    const activities = canAssociateDatedActivities
      ? uniqueById(profile.activities.filter((activity) =>
          studyIds.has(activity.studyId) && occurredAfter(activity.occurredAt, cutoff),
        ))
      : [];
    const quizResults = canAssociateDatedActivities
      ? uniqueById(quizzes.filter((result) =>
          studyIds.has(result.studyId) && occurredAfter(result.completedAt, cutoff),
        ))
      : [];
    const reviewedCards = canAssociateDatedActivities
      ? uniqueById(flashcards.filter((card) =>
          studyIds.has(card.studyId) && Boolean(card.lastReviewedAt) && occurredAfter(card.lastReviewedAt!, cutoff),
        ))
      : [];

    // QuizService é a fonte canônica de tentativas. Eventos "quiz" do Learning
    // Service representam a mesma conclusão e não entram novamente na contagem.
    const nonQuizActivities = activities.filter((activity) => activity.type !== "quiz");
    const flashcardActivities = activities.filter((activity) => activity.type === "flashcard");
    const correctAnswers = quizResults.reduce((total, result) => total + result.correctAnswers, 0);
    const wrongAnswers = quizResults.reduce((total, result) => total + result.wrongAnswers, 0);
    const answered = correctAnswers + wrongAnswers;
    const activityStudyIds = new Set([
      ...activities.map((activity: LearningActivity) => activity.studyId),
      ...quizResults.map((result) => result.studyId),
    ]);
    const topicsStudied = associatedStudies.filter((study) => study.progress > 0 || activityStudyIds.has(study.studyId)).length;
    const activitiesCompleted = nonQuizActivities.length + quizResults.length;
    const studyProgress = associatedStudies.length > 0
      ? Math.round(associatedStudies.reduce((total, study) => total + study.progress, 0) / associatedStudies.length)
      : null;
    const state: ExamProgressState = associatedStudies.length === 0
      ? "insufficient_data"
      : associatedStudies.every((study) => study.status === "completed" || study.progress === 100)
        ? "completed"
        : activitiesCompleted > 0 || associatedStudies.some((study) => study.progress > 0)
          ? "in_progress"
          : "not_started";

    return {
      state,
      studies: associatedStudies.map(({ studyId, title, subject, progress, status }) => ({ studyId, title, subject, progress, status })),
      studyProgress,
      topicsStudied,
      activitiesCompleted,
      studyMinutes: Number(activities.reduce((total, activity) => total + activity.durationMinutes, 0).toFixed(1)),
      flashcardReviews: flashcardActivities.length,
      reviewedCards: reviewedCards.length,
      quizAttempts: quizResults.length,
      correctAnswers,
      wrongAnswers,
      performance: answered > 0 ? Math.round(correctAnswers / answered * 100) : null,
      canAssociateDatedActivities,
      protectedExamResultsIncluded: false,
    };
  },
};
