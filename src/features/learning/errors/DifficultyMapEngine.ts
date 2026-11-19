import { KnowledgeEngine } from "@/features/learning/KnowledgeEngine";
import { ReviewScheduler } from "@/features/learning/ReviewScheduler";
import { StudyPriorityEngine } from "@/features/learning/StudyPriorityEngine";
import { reviewPeriod, type TopicReview } from "@/features/learning/TopicReview";
import type { KnowledgeScore, LearningProfile, StudyPriority } from "@/features/learning/types";
import type { Flashcard } from "@/types/flashcard";
import type { QuizResult } from "@/types/quiz";
import type { StudyRecord } from "@/types/study-engine";
import type { ErrorNotebookEntry } from "./types";

export type DifficultyLevelState =
  | "insufficient_data"
  | "critical"
  | "attention"
  | "mastered";

export type StudyEvolutionSummary = {
  hasTrendData: boolean;
  quizAttempts: number;
  latestScore?: number;
  delta?: number;
  label: string;
};

export type DifficultyMapItem = {
  study: StudyRecord;
  knowledge: KnowledgeScore;
  priority: StudyPriority;
  level: DifficultyLevelState;
  pendingErrorsCount: number;
  resolvedErrorsCount: number;
  totalOccurrences: number;
  dueFlashcardsCount: number;
  reviewStatus: "late" | "today" | "upcoming" | "new";
  evolution: StudyEvolutionSummary;
  reasons: string[];
};

export type TargetedReviewRecommendation = {
  id: string;
  studyId: string;
  studyTitle: string;
  subject: string;
  discipline: string;
  urgencyScore: number;
  urgencyLabel: "Alta" | "Média" | "Baixa";
  pendingErrorsCount: number;
  dueFlashcardsCount: number;
  reviewStatus: "late" | "today" | "upcoming" | "new";
  reasons: string[];
  targetHref: string;
  sampleErrors: ErrorNotebookEntry[];
};

export type DifficultyMapInput = {
  studies: readonly StudyRecord[];
  profile: LearningProfile;
  flashcards: readonly Flashcard[];
  quizzes: readonly QuizResult[];
  topicReviews: readonly TopicReview[];
  errorEntries: readonly ErrorNotebookEntry[];
  now?: Date;
};

export function resolveStudyDisciplineKey(study: Pick<StudyRecord, "course" | "semester" | "subject">): string {
  const subject = study.subject?.trim() || "Geral";
  return JSON.stringify([study.course?.trim() ?? "", study.semester?.trim() ?? "", subject]);
}

function buildEvolution(studyQuizzes: readonly QuizResult[]): StudyEvolutionSummary {
  if (studyQuizzes.length === 0) {
    return {
      hasTrendData: false,
      quizAttempts: 0,
      label: "Sem tentativas avaliadas",
    };
  }
  const ordered = [...studyQuizzes].sort((left, right) => right.completedAt.localeCompare(left.completedAt));
  if (ordered.length === 1) {
    return {
      hasTrendData: false,
      quizAttempts: 1,
      latestScore: ordered[0].score,
      label: `1ª avaliação: ${ordered[0].score}% (aguardando mais dados para tendência)`,
    };
  }
  const delta = ordered[0].score - ordered[1].score;
  const sign = delta > 0 ? "+" : "";
  return {
    hasTrendData: true,
    quizAttempts: ordered.length,
    latestScore: ordered[0].score,
    delta,
    label: `Último ${ordered[0].score}% (${sign}${delta} pts vs anterior)`,
  };
}

export const DifficultyMapEngine = {
  build(input: DifficultyMapInput): {
    items: DifficultyMapItem[];
    recommendations: TargetedReviewRecommendation[];
  } {
    const now = input.now ?? new Date();
    const items: DifficultyMapItem[] = [];
    const recommendations: TargetedReviewRecommendation[] = [];

    for (const study of input.studies) {
      const knowledge = KnowledgeEngine.calculate(
        study,
        input.profile,
        input.flashcards,
        input.quizzes,
        now,
      );
      const priority = StudyPriorityEngine.calculate(
        study,
        knowledge,
        input.profile,
        input.flashcards,
        now,
      );
      const studyErrors = input.errorEntries.filter((entry) => entry.studyId === study.studyId);
      const pendingErrors = studyErrors.filter((entry) => entry.status === "pending");
      const resolvedErrors = studyErrors.filter((entry) => entry.status === "resolved");
      const totalOccurrences = studyErrors.reduce((sum, entry) => sum + entry.occurrences, 0);

      const studyQuizzes = input.quizzes.filter((quiz) => quiz.studyId === study.studyId);
      const studyCards = input.flashcards.filter((card) => card.studyId === study.studyId);
      const dueFlashcardsCount = studyCards.filter((card) => ReviewScheduler.isDue(card, now)).length;
      const review = input.topicReviews.find((entry) => entry.studyId === study.studyId);
      const reviewStatus = reviewPeriod(review?.nextReviewAt, now);

      const hasAnyData =
        knowledge.classification !== "never_studied" ||
        studyErrors.length > 0 ||
        Boolean(review);

      let level: DifficultyLevelState;
      if (!hasAnyData) {
        level = "insufficient_data";
      } else if (
        pendingErrors.length >= 2 ||
        knowledge.classification === "difficult" ||
        (reviewStatus === "late" && pendingErrors.length > 0)
      ) {
        level = "critical";
      } else if (
        knowledge.classification === "strong" &&
        pendingErrors.length === 0 &&
        dueFlashcardsCount === 0 &&
        reviewStatus !== "late"
      ) {
        level = "mastered";
      } else {
        level = "attention";
      }

      const reasons: string[] = [];
      if (!hasAnyData) {
        reasons.push("Ainda sem quiz, flashcards, revisões ou erros registrados");
      } else {
        if (pendingErrors.length > 0) {
          reasons.push(`${pendingErrors.length} erro(s) pendente(s) no Caderno de Erros`);
        }
        if (reviewStatus === "late") {
          reasons.push("Revisão espaçada atrasada");
        } else if (reviewStatus === "today") {
          reasons.push("Revisão programada para hoje");
        }
        if (dueFlashcardsCount > 0) {
          reasons.push(`${dueFlashcardsCount} flashcard(s) pendente(s)`);
        }
        if (knowledge.classification === "difficult") {
          reasons.push(`Dificuldade detectada (${knowledge.knowledge}% de domínio)`);
        } else if (knowledge.classification === "forgotten") {
          reasons.push("Tema sem prática recente (risco de esquecimento)");
        } else if (level === "mastered") {
          reasons.push(`Domínio satisfatório (${knowledge.knowledge}% com ${knowledge.confidence}% de confiança)`);
        }
      }

      items.push({
        study,
        knowledge,
        priority,
        level,
        pendingErrorsCount: pendingErrors.length,
        resolvedErrorsCount: resolvedErrors.length,
        totalOccurrences,
        dueFlashcardsCount,
        reviewStatus,
        evolution: buildEvolution(studyQuizzes),
        reasons,
      });

      const needsTargetedReview =
        pendingErrors.length > 0 ||
        reviewStatus === "late" ||
        reviewStatus === "today" ||
        dueFlashcardsCount > 0 ||
        knowledge.classification === "difficult" ||
        knowledge.classification === "forgotten";

      if (hasAnyData && needsTargetedReview) {
        const urgencyScore = Math.min(
          100,
          priority.score +
            pendingErrors.length * 14 +
            (reviewStatus === "late" ? 18 : reviewStatus === "today" ? 8 : 0),
        );
        const urgencyLabel = urgencyScore >= 65 ? "Alta" : urgencyScore >= 35 ? "Média" : "Baixa";
        const tab = pendingErrors.length > 0 || knowledge.classification === "difficult" ? "tutor" : "quiz";

        recommendations.push({
          id: `targeted:${study.studyId}`,
          studyId: study.studyId,
          studyTitle: study.title,
          subject: study.subject,
          discipline: review?.discipline || resolveStudyDisciplineKey(study),
          urgencyScore,
          urgencyLabel,
          pendingErrorsCount: pendingErrors.length,
          dueFlashcardsCount,
          reviewStatus,
          reasons: reasons.slice(0, 3),
          targetHref: `/estudo?tema=${encodeURIComponent(study.studyId)}&aba=${tab}&origem=aprendizagem`,
          sampleErrors: pendingErrors.slice(0, 3),
        });
      }
    }

    const levelRank: Record<DifficultyLevelState, number> = {
      critical: 0,
      attention: 1,
      insufficient_data: 2,
      mastered: 3,
    };

    items.sort((left, right) => {
      if (levelRank[left.level] !== levelRank[right.level]) {
        return levelRank[left.level] - levelRank[right.level];
      }
      if (right.pendingErrorsCount !== left.pendingErrorsCount) {
        return right.pendingErrorsCount - left.pendingErrorsCount;
      }
      return right.priority.score - left.priority.score;
    });

    recommendations.sort((left, right) => {
      if (right.urgencyScore !== left.urgencyScore) return right.urgencyScore - left.urgencyScore;
      return right.pendingErrorsCount - left.pendingErrorsCount;
    });

    return { items, recommendations };
  },
};
