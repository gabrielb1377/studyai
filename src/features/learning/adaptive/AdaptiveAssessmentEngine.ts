import { ReviewScheduler } from "@/features/learning/ReviewScheduler";
import type { QuizDifficulty, QuizResult } from "@/types/quiz";
import type { ErrorNotebookEntry } from "@/features/learning/errors/types";
import type {
  AdaptiveMaterialSelectionInput,
  AdaptiveMaterialSelectionResult,
  AdaptiveQuizSelectionInput,
  AdaptiveQuizSelectionResult,
  AdaptiveSelectionReason,
  AssessmentReliability,
  PostAssessmentReviewStep,
  ReliableAssessmentIndicator,
  ReliableIndicatorInput,
} from "./types";

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesError(questionId: string, prompt: string, error: ErrorNotebookEntry): boolean {
  if (error.status === "resolved") return false;
  if (error.sourceId && error.sourceId === questionId) return true;
  const normalizedPrompt = normalizeText(prompt);
  const normalizedError = normalizeText(error.questionPrompt);
  if (!normalizedPrompt || !normalizedError) return false;
  return (
    normalizedPrompt === normalizedError ||
    (normalizedError.length >= 16 && normalizedPrompt.includes(normalizedError.slice(0, 32)))
  );
}

function clampCount(requested: number, available: number): number {
  if (!Number.isFinite(requested) || available <= 0) return 0;
  return Math.max(1, Math.min(30, Math.floor(requested), available));
}

function difficultyDistance(a: QuizDifficulty, b: QuizDifficulty): number {
  const rank: Record<QuizDifficulty, number> = { easy: 0, medium: 1, hard: 2 };
  return Math.abs(rank[a] - rank[b]);
}

export const AdaptiveAssessmentEngine = {
  recommendTargetDifficulty(
    knowledgeScore: number | undefined,
    recentResults: readonly QuizResult[],
  ): QuizDifficulty {
    const ordered = [...recentResults].sort((a, b) => b.completedAt.localeCompare(a.completedAt));
    const latest = ordered[0];
    let target: QuizDifficulty = "medium";

    if (knowledgeScore !== undefined) {
      if (knowledgeScore < 50) target = "easy";
      else if (knowledgeScore >= 75) target = "hard";
      else target = "medium";
    } else if (latest) {
      if (latest.score < 50) target = "easy";
      else if (latest.score >= 80) target = "hard";
      else target = "medium";
    }

    if (latest && latest.score < 50) {
      if (target === "hard") target = "medium";
      else if (target === "medium") target = "easy";
    }
    return target;
  },

  selectAdaptiveQuizQuestions(input: AdaptiveQuizSelectionInput): AdaptiveQuizSelectionResult {
    const recommendedDifficulty =
      input.mode && input.mode !== "adaptive"
        ? input.mode
        : this.recommendTargetDifficulty(input.knowledge?.knowledge, input.results);

    const targetCount = clampCount(input.count, input.questions.length);
    if (targetCount === 0) {
      return {
        selectedQuestions: [],
        reasonsByQuestionId: {},
        recommendedDifficulty,
        prioritizedErrorCount: 0,
        insufficientBank: true,
        summary: "Nenhuma questão disponível para montar um simulado adaptativo.",
      };
    }

    const orderedResults = [...input.results].sort((a, b) => b.completedAt.localeCompare(a.completedAt));
    const latestIds = new Set(orderedResults[0]?.questionIds ?? []);
    const activeErrors = input.errorEntries.filter((entry) => entry.status !== "resolved");

    const scored = input.questions.map((question) => {
      let priorityScore = 0;
      const reasons: string[] = [];
      const errorMatched = activeErrors.some((entry) =>
        matchesError(question.id, question.question, entry),
      );
      if (errorMatched) {
        priorityScore += 50;
        reasons.push("Erro pendente no Caderno de Erros");
      }

      const dist = difficultyDistance(question.difficulty, recommendedDifficulty);
      if (dist === 0) {
        priorityScore += 25;
        reasons.push(`Dificuldade ${question.difficulty} alinhada ao nível atual`);
      } else if (dist === 1) {
        priorityScore += 10;
      }

      if (!latestIds.has(question.id)) {
        priorityScore += 20;
        reasons.push("Pouco praticada na última tentativa");
      }

      if (reasons.length === 0) {
        reasons.push("Reforço de base do estudo");
      }

      return {
        question,
        reason: {
          questionId: question.id,
          priorityScore,
          reasons,
          errorMatched,
          difficulty: question.difficulty,
        } satisfies AdaptiveSelectionReason,
      };
    });

    scored.sort((left, right) => {
      if (right.reason.priorityScore !== left.reason.priorityScore) {
        return right.reason.priorityScore - left.reason.priorityScore;
      }
      const createdCmp = left.question.createdAt.localeCompare(right.question.createdAt);
      if (createdCmp !== 0) return createdCmp;
      return left.question.id.localeCompare(right.question.id);
    });

    const chosen = scored.slice(0, targetCount);
    const selectedQuestions = chosen.map((item) => item.question);
    const reasonsByQuestionId = Object.fromEntries(
      chosen.map((item) => [item.question.id, item.reason]),
    );
    const prioritizedErrorCount = chosen.filter((item) => item.reason.errorMatched).length;
    const insufficientBank = input.questions.length < input.count;

    const parts = [
      `Selecionadas ${selectedQuestions.length} questões (nível alvo: ${
        recommendedDifficulty === "easy" ? "fácil" : recommendedDifficulty === "hard" ? "difícil" : "médio"
      })`,
    ];
    if (prioritizedErrorCount > 0) {
      parts.push(`${prioritizedErrorCount} priorizadas por erros pendentes`);
    }
    if (insufficientBank) {
      parts.push(`banco atual possui ${input.questions.length} de ${input.count} solicitadas`);
    }

    return {
      selectedQuestions,
      reasonsByQuestionId,
      recommendedDifficulty,
      prioritizedErrorCount,
      insufficientBank,
      summary: `${parts.join(" · ")}.`,
    };
  },

  selectAdaptiveMaterialQuestions(input: AdaptiveMaterialSelectionInput): AdaptiveMaterialSelectionResult {
    const targetCount = clampCount(input.count, input.questions.length);
    if (targetCount === 0) {
      return {
        selectedQuestions: [],
        prioritizedErrorCount: 0,
        summary: "Sem questões disponíveis nos materiais vinculados.",
      };
    }

    const activeErrors = input.errorEntries.filter((entry) => entry.status !== "resolved");
    const confirmedCorrectIds = new Set<string>();
    const recentAttemptIds = new Set<string>(
      input.attempts[0]?.questions.map((question) => question.id) ?? [],
    );

    for (const attempt of input.attempts) {
      for (const question of attempt.questions) {
        const answer = attempt.answers[question.id];
        const confirmed = attempt.confirmedKeys?.[question.id]?.choice;
        if (answer && confirmed !== undefined && answer.choice === confirmed) {
          confirmedCorrectIds.add(question.id);
        }
      }
    }

    const scored = input.questions.map((question) => {
      let score = 0;
      const errorMatched = activeErrors.some((entry) =>
        matchesError(question.id, question.statement, entry),
      );
      if (errorMatched) score += 60;
      if (!confirmedCorrectIds.has(question.id)) score += 25;
      if (!recentAttemptIds.has(question.id)) score += 15;
      return { question, score, errorMatched };
    });

    scored.sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.question.id.localeCompare(right.question.id);
    });

    const chosen = scored.slice(0, targetCount);
    const prioritizedErrorCount = chosen.filter((item) => item.errorMatched).length;
    const summary =
      prioritizedErrorCount > 0
        ? `${chosen.length} questões selecionadas (${prioritizedErrorCount} ligadas a erros pendentes).`
        : `${chosen.length} questões selecionadas priorizando itens ainda não confirmados.`;

    return {
      selectedQuestions: chosen.map((item) => item.question),
      prioritizedErrorCount,
      summary,
    };
  },

  buildPostAssessmentReviewPlan(params: {
    studyId?: string;
    latestResult?: QuizResult;
    pendingErrorsCount: number;
    dueFlashcardsCount: number;
    reliability: AssessmentReliability;
  }): PostAssessmentReviewStep[] {
    const steps: PostAssessmentReviewStep[] = [];
    const studyQuery = params.studyId ? `&tema=${encodeURIComponent(params.studyId)}` : "";
    const studyPrefix = params.studyId ? `?tema=${encodeURIComponent(params.studyId)}` : "";

    if (params.pendingErrorsCount > 0) {
      steps.push({
        id: "review-errors",
        kind: "error_notebook",
        title: `Revisar ${params.pendingErrorsCount} erro(s) no Caderno`,
        description: "Consolide as questões erradas antes de avançar para novos simulados.",
        priority: "alta",
        href: `/aprendizagem?aba=erros${studyQuery}`,
      });
    }

    if (params.dueFlashcardsCount > 0 && params.studyId) {
      steps.push({
        id: "review-flashcards",
        kind: "flashcards",
        title: `Praticar ${params.dueFlashcardsCount} flashcard(s) vencido(s)`,
        description: "Reforce a memória ativa nos cartões com revisão agendada para hoje.",
        priority: "alta",
        href: `/estudo${studyPrefix}&aba=flashcards`,
      });
    }

    if (params.latestResult && params.latestResult.score < 70 && params.studyId) {
      steps.push({
        id: "review-tutor",
        kind: "tutor",
        title: "Tirar dúvidas com o Tutor IA",
        description: "Peça explicação passo a passo dos pontos com menor acerto.",
        priority: "media",
        href: `/estudo${studyPrefix}&aba=tutor`,
      });
    }

    if (params.studyId && (params.reliability !== "reliable" || (params.latestResult?.score ?? 0) >= 70)) {
      steps.push({
        id: "next-adaptive",
        kind: "adaptive_quiz",
        title:
          params.reliability === "insufficient"
            ? "Ampliar amostra com simulado adaptativo"
            : "Consolidar com novo simulado adaptativo",
        description:
          params.reliability === "insufficient"
            ? "Ainda há poucas questões avaliadas para confirmar o domínio."
            : "Pratique novamente priorizando lacunas e nível ajustado.",
        priority: params.reliability === "insufficient" ? "media" : "baixa",
        href: `/estudo${studyPrefix}&aba=quiz`,
      });
    }

    return steps;
  },

  computeReliableIndicators(input: ReliableIndicatorInput): ReliableAssessmentIndicator {
    const now = input.now ?? new Date();
    const studyId = input.study?.studyId;

    const scopedQuizzes = studyId
      ? input.quizzes.filter((quiz) => quiz.studyId === studyId)
      : input.quizzes;
    const scopedFlashcards = studyId
      ? input.flashcards.filter((card) => card.studyId === studyId)
      : input.flashcards;
    const scopedErrors = studyId
      ? input.errorEntries.filter((entry) => entry.studyId === studyId && entry.status !== "resolved")
      : input.errorEntries.filter((entry) => entry.status !== "resolved");

    const ordered = [...scopedQuizzes].sort((a, b) => b.completedAt.localeCompare(a.completedAt));
    const sessionsCount = ordered.length;
    const totalCorrect = ordered.reduce((sum, item) => sum + item.correctAnswers, 0);
    const totalWrong = ordered.reduce((sum, item) => sum + item.wrongAnswers, 0);
    const sampleSize = totalCorrect + totalWrong;

    let reliability: AssessmentReliability = "insufficient";
    let reliabilityLabel = "Amostra insuficiente";
    if (sessionsCount >= 2 && sampleSize >= 8) {
      reliability = "reliable";
      reliabilityLabel = "Indicador confiável";
    } else if (sessionsCount >= 1 && sampleSize >= 3) {
      reliability = "partial";
      reliabilityLabel = "Indicador parcial";
    }

    const accuracyPercent = sampleSize > 0 ? Math.round((totalCorrect / sampleSize) * 100) : null;
    const evolutionDelta = ordered.length >= 2 ? ordered[0].score - ordered[1].score : null;
    const dueFlashcardsCount = scopedFlashcards.filter((card) => ReviewScheduler.isDue(card, now)).length;
    const recommendedDifficulty = this.recommendTargetDifficulty(input.knowledge?.knowledge, ordered);

    const nextReviewSteps = this.buildPostAssessmentReviewPlan({
      studyId,
      latestResult: ordered[0],
      pendingErrorsCount: scopedErrors.length,
      dueFlashcardsCount,
      reliability,
    });

    return {
      studyId,
      reliability,
      reliabilityLabel,
      sampleSize,
      sessionsCount,
      accuracyPercent,
      evolutionDelta,
      pendingErrorsCount: scopedErrors.length,
      dueFlashcardsCount,
      recommendedDifficulty,
      disclaimer:
        "Indicadores baseados exclusivamente em práticas e revisões locais; tentativas do Modo Prova protegido permanecem isoladas.",
      nextReviewSteps,
    };
  },
};
