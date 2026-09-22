import { ReviewScheduler } from "@/features/learning/ReviewScheduler";
import type { KnowledgeScore, LearningProfile, StudyPriority } from "@/features/learning/types";
import type { Flashcard } from "@/types/flashcard";
import type { QuizResult } from "@/types/quiz";
import type { StudyRecord } from "@/types/study-engine";
import type { MentorGoal, MentorRecommendation } from "../types";

export const RecommendationEngine = {
  calculate(input: { study: StudyRecord; profile: LearningProfile; knowledge: KnowledgeScore; priority: StudyPriority; flashcards: readonly Flashcard[]; quizzes: readonly QuizResult[]; goals: readonly MentorGoal[]; now?: Date }) {
    const { study, profile, knowledge, priority, flashcards, quizzes, goals } = input;
    const now = input.now ?? new Date();
    const recommendations: MentorRecommendation[] = [];
    const add = (type: MentorRecommendation["type"], title: string, reason: string, action: MentorRecommendation["action"]) => recommendations.push({
      id: `${study.studyId}:${type}:${action}`,
      studyId: study.studyId,
      type, title, reason, action, priority: priority.level, createdAt: now.toISOString(),
    });
    const due = flashcards.filter((card) => card.studyId === study.studyId && ReviewScheduler.isDue(card, now)).length;
    if (due > 0) add("review", `Revisar ${due} flashcards`, "Há cartões com revisão prevista para agora.", "flashcards");
    else {
      const nextReview = flashcards
        .filter((card) => card.studyId === study.studyId && card.nextReviewAt)
        .sort((left, right) => left.nextReviewAt!.localeCompare(right.nextReviewAt!))[0];
      if (nextReview?.nextReviewAt) add("review", `Próxima revisão em ${new Date(nextReview.nextReviewAt).toLocaleDateString("pt-BR")}`, "Agendamento calculado pelo histórico real de revisão.", "flashcards");
    }
    if (knowledge.classification === "never_studied" || knowledge.classification === "forgotten") add("reading", "Retomar o material", priority.reasons.join(" · "), "reading");
    if (knowledge.classification === "difficult") add("practice", "Consolidar os pontos difíceis", priority.reasons.join(" · "), "question");
    const latestQuiz = quizzes.filter((quiz) => quiz.studyId === study.studyId).sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0];
    if (!latestQuiz || latestQuiz.score < 70) add("practice", "Praticar com um quiz", latestQuiz ? `Último aproveitamento: ${latestQuiz.score}%.` : "Ainda não há resultado de quiz para este tema.", "quiz");
    const activeGoal = goals.find((goal) => goal.status === "active" && (!goal.studyId || goal.studyId === study.studyId));
    if (activeGoal) add("goal", activeGoal.title, `Meta ativa com ${activeGoal.progress}% de progresso.`, "review");
    if (knowledge.knowledge >= 75 && (profile.topics[study.studyId]?.accessDates.length ?? 0) > 1) add("progress", "Avançar com um desafio", `Domínio estimado em ${knowledge.knowledge}% com evidência recorrente.`, "question");
    return recommendations.slice(0, 5);
  },

  inBackground<T>(task: () => T): Promise<T> {
    return new Promise((resolve) => {
      const run = () => resolve(task());
      if (typeof window !== "undefined" && "requestIdleCallback" in window) window.requestIdleCallback(run, { timeout: 600 });
      else globalThis.setTimeout(run, 0);
    });
  },
};
