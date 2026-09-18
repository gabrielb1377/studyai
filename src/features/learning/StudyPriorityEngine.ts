import type { Flashcard } from "@/types/flashcard";
import type { StudyRecord } from "@/types/study-engine";
import type { KnowledgeScore, LearningProfile, StudyPriority } from "./types";
import { ReviewScheduler } from "./ReviewScheduler";

const DAY = 86_400_000;

export const StudyPriorityEngine = {
  calculate(
    study: StudyRecord,
    knowledge: KnowledgeScore,
    profile: LearningProfile,
    flashcards: readonly Flashcard[],
    now = new Date(),
  ): StudyPriority {
    const topic = profile.topics[study.studyId];
    const errors = topic?.wrongAnswers ?? 0;
    const lastAccess = topic?.lastAccessedAt ?? (study.progress > 0 ? study.lastAccessedAt : undefined);
    const daysWithoutReview = lastAccess
      ? Math.max(0, Math.floor((now.getTime() - new Date(lastAccess).getTime()) / DAY))
      : 30;
    const dueCards = flashcards.filter((card) => card.studyId === study.studyId && ReviewScheduler.isDue(card, now)).length;
    const score = Math.min(100, Math.round(
      (100 - knowledge.knowledge) * 0.7 + Math.min(30, daysWithoutReview * 2) +
      Math.min(15, errors * 2) + Math.min(15, dueCards * 2),
    ));
    const reasons: string[] = [];
    if (errors > 0) reasons.push(`${errors} ${errors === 1 ? "erro registrado" : "erros registrados"}`);
    if (daysWithoutReview >= 2) reasons.push(`${daysWithoutReview} dias sem revisão`);
    if (dueCards > 0) reasons.push(`${dueCards} ${dueCards === 1 ? "flashcard pendente" : "flashcards pendentes"}`);
    reasons.push(`${knowledge.knowledge}% de conhecimento estimado`);

    return {
      studyId: study.studyId,
      title: study.title,
      score,
      level: score >= 60 ? "Alta" : score >= 30 ? "Média" : "Baixa",
      reasons: reasons.slice(0, 3),
    };
  },
};
