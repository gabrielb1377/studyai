import type { Flashcard } from "@/types/flashcard";
import type { QuizResult } from "@/types/quiz";
import type { StudyRecord } from "@/types/study-engine";
import type { KnowledgeScore, LearningProfile, QuizInsight } from "./types";

const DAY = 86_400_000;
const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

export const KnowledgeEngine = {
  calculate(
    study: StudyRecord,
    profile: LearningProfile,
    flashcards: readonly Flashcard[],
    quizzes: readonly QuizResult[],
    now = new Date(),
  ): KnowledgeScore {
    const topic = profile.topics[study.studyId];
    const studyCards = flashcards.filter((card) => card.studyId === study.studyId);
    const studyQuizzes = quizzes.filter((quiz) => quiz.studyId === study.studyId);
    const reviews = studyCards.reduce((total, card) => total + card.correctAnswers + card.wrongAnswers, 0);
    const correctReviews = studyCards.reduce((total, card) => total + card.correctAnswers, 0);
    const quiz = studyQuizzes.length
      ? studyQuizzes.reduce((total, result) => total + result.score, 0) / studyQuizzes.length
      : 0;
    const flashcardScore = reviews ? correctReviews / reviews * 100 : 0;
    const time = Math.min(100, (topic?.timeMinutes ?? 0) / 120 * 100);
    const frequency = Math.min(100, (topic?.accessDates.length ?? 0) / 7 * 100);
    const lastAccess = topic?.lastAccessedAt ?? (study.progress > 0 ? study.lastAccessedAt : undefined);
    const daysSince = lastAccess ? Math.max(0, (now.getTime() - new Date(lastAccess).getTime()) / DAY) : Number.POSITIVE_INFINITY;
    const recency = Number.isFinite(daysSince) ? Math.max(0, 100 - daysSince * 4) : 0;
    const knowledge = clamp(quiz * 0.35 + flashcardScore * 0.3 + time * 0.15 + frequency * 0.1 + recency * 0.1);
    const evidence = studyQuizzes.length * 20 + reviews * 3 + (topic?.timeMinutes ?? 0) * 0.25 + (topic?.accessDates.length ?? 0) * 5;
    const confidence = clamp(evidence);
    const attempted = studyQuizzes.length > 0 || reviews > 0 || (topic?.timeMinutes ?? 0) > 0 || study.progress > 0;
    const errors = studyCards.reduce((total, card) => total + card.wrongAnswers, 0) +
      studyQuizzes.reduce((total, result) => total + result.wrongAnswers, 0);
    const correct = studyCards.reduce((total, card) => total + card.correctAnswers, 0) +
      studyQuizzes.reduce((total, result) => total + result.correctAnswers, 0);

    const classification = !attempted
      ? "never_studied"
      : daysSince >= 14 && knowledge < 75
        ? "forgotten"
        : knowledge >= 75 && confidence >= 50
          ? "strong"
          : knowledge < 50 || (errors > correct && errors >= 2)
            ? "difficult"
            : "developing";

    return {
      studyId: study.studyId,
      subject: study.subject,
      topic: study.title,
      knowledge,
      confidence,
      mastery: knowledge >= 75 ? "Avançado" : knowledge >= 40 ? "Intermediário" : "Iniciante",
      classification,
      components: {
        quiz: clamp(quiz),
        flashcards: clamp(flashcardScore),
        time: clamp(time),
        frequency: clamp(frequency),
        recency: clamp(recency),
      },
    };
  },

  quizInsight(results: readonly QuizResult[]): QuizInsight {
    const ordered = [...results].sort((left, right) => right.completedAt.localeCompare(left.completedAt));
    const latest = ordered[0];
    const previous = ordered[1];
    const evolution = latest ? latest.score - (previous?.score ?? latest.score) : 0;
    const score = latest?.score ?? 0;
    return {
      evolution,
      comparison: previous
        ? `${evolution >= 0 ? "+" : ""}${evolution} pontos em relação ao quiz anterior`
        : "Primeiro resultado deste tema",
      strengths: score >= 70 ? ["Boa compreensão dos conceitos avaliados"] : ["Você concluiu a prática e criou uma base de comparação"],
      weaknesses: score < 70 ? ["Os conceitos das questões incorretas precisam de revisão"] : [],
      recommendation: score >= 85
        ? "Avance para uma revisão espaçada dos flashcards."
        : score >= 60
          ? "Revise os erros e refaça o quiz em alguns dias."
          : "Releia o resumo e peça ao Tutor uma explicação passo a passo.",
    };
  },
};
