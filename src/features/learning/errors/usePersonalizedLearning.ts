"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFlashcards } from "@/features/flashcards/useFlashcards";
import type { TopicReview } from "@/features/learning/TopicReview";
import { TopicReviewStorage } from "@/features/learning/TopicReviewStorage";
import { useLearningEngine } from "@/features/learning/hooks/useLearningEngine";
import { useQuiz } from "@/features/quiz/useQuiz";
import { useStudyEngine } from "@/features/study/hooks/useStudyEngine";
import { STORAGE_UPDATED_EVENT } from "@/lib/storage/StorageManager";
import {
  DifficultyMapEngine,
  type TargetedReviewRecommendation,
} from "./DifficultyMapEngine";
import {
  ERROR_NOTEBOOK_UPDATED_EVENT,
  ErrorNotebookStorage,
} from "./ErrorNotebookStorage";
import type { ErrorNotebookEntry, ErrorReviewStatus } from "./types";

export type ManualErrorDraft = {
  studyId?: string;
  topic: string;
  questionPrompt: string;
  wrongAnswer: string;
  correctAnswer?: string;
  explanation?: string;
};

export function usePersonalizedLearning() {
  const {
    records: studies,
    isLoading: studiesLoading,
    error: studiesError,
  } = useStudyEngine();
  const { cards: flashcards, isReady: flashcardsReady } = useFlashcards();
  const { results: quizzes } = useQuiz();
  const { profile, isLoading: learningLoading } = useLearningEngine(
    studies,
    flashcards,
    quizzes,
  );

  const [rawErrors, setRawErrors] = useState<ErrorNotebookEntry[]>([]);
  const [topicReviews, setTopicReviews] = useState<TopicReview[]>([]);
  const [auxLoading, setAuxLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());

  const loadAuxData = useCallback(async () => {
    try {
      const [loadedErrors, loadedReviews] = await Promise.all([
        ErrorNotebookStorage.load(),
        TopicReviewStorage.load(),
      ]);
      setRawErrors(loadedErrors);
      setTopicReviews(loadedReviews);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível carregar os dados do Caderno de Erros.",
      );
    } finally {
      setAuxLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAuxData();
    const reload = () => {
      void loadAuxData();
    };
    window.addEventListener(STORAGE_UPDATED_EVENT, reload);
    window.addEventListener(ERROR_NOTEBOOK_UPDATED_EVENT, reload);
    return () => {
      window.removeEventListener(STORAGE_UPDATED_EVENT, reload);
      window.removeEventListener(ERROR_NOTEBOOK_UPDATED_EVENT, reload);
    };
  }, [loadAuxData]);

  const entries = useMemo(() => {
    if (studiesLoading) return rawErrors;
    return ErrorNotebookStorage.reconcileWithStudies(rawErrors, studies);
  }, [rawErrors, studies, studiesLoading]);

  const { items: difficultyItems, recommendations } = useMemo(
    () =>
      DifficultyMapEngine.build({
        studies,
        profile,
        flashcards,
        quizzes,
        topicReviews,
        errorEntries: entries,
      }),
    [entries, flashcards, profile, quizzes, studies, topicReviews],
  );

  const enqueueOperation = useCallback(
    (runner: () => Promise<void>, successMessage: string) => {
      setIsSaving(true);
      setError(null);
      const task = saveChainRef.current.then(async () => {
        await runner();
        setStatusMessage(successMessage);
      });
      saveChainRef.current = task
        .catch((caught) => {
          setError(
            caught instanceof Error
              ? caught.message
              : "Não foi possível salvar a alteração.",
          );
        })
        .finally(() => {
          setIsSaving(false);
        });
      return task;
    },
    [],
  );

  const addManualEntry = useCallback(
    async (draft: ManualErrorDraft) => {
      const linkedStudy = draft.studyId
        ? studies.find((study) => study.studyId === draft.studyId)
        : undefined;
      await enqueueOperation(async () => {
        const updated = await ErrorNotebookStorage.addManualEntry({
          studyId: linkedStudy?.studyId,
          studyTitle: linkedStudy?.title ?? "Estudo livre",
          subject: linkedStudy?.subject ?? "Geral",
          topic: draft.topic.trim() || linkedStudy?.title || "Geral",
          questionPrompt: draft.questionPrompt.trim(),
          wrongAnswer: draft.wrongAnswer.trim(),
          correctAnswer: draft.correctAnswer?.trim() || undefined,
          explanation: draft.explanation?.trim() || undefined,
        });
        setRawErrors(updated);
      }, "Erro registrado no Caderno de Erros.");
    },
    [enqueueOperation, studies],
  );

  const markErrorStatus = useCallback(
    async (entryId: string, status: ErrorReviewStatus) => {
      const label =
        status === "resolved"
          ? "Erro marcado como resolvido."
          : status === "reviewed"
            ? "Erro marcado como revisado."
            : "Erro reaberto como pendente.";
      await enqueueOperation(async () => {
        const updated = await ErrorNotebookStorage.markStatus(entryId, status);
        setRawErrors(updated);
      }, label);
    },
    [enqueueOperation],
  );

  const removeEntry = useCallback(
    async (entryId: string) => {
      await enqueueOperation(async () => {
        const updated = await ErrorNotebookStorage.removeEntry(entryId);
        setRawErrors(updated);
      }, "Registro removido do Caderno de Erros.");
    },
    [enqueueOperation],
  );

  const completeTargetedReview = useCallback(
    async (
      recommendation: TargetedReviewRecommendation,
      outcome: "correct" | "wrong",
    ) => {
      const message =
        outcome === "correct"
          ? `Revisão de "${recommendation.studyTitle}" registrada como acertada.`
          : `Revisão de "${recommendation.studyTitle}" registrada para reforço contínuo.`;
      await enqueueOperation(async () => {
        const nextReviews = await TopicReviewStorage.record(
          {
            discipline: recommendation.discipline,
            studyId: recommendation.studyId,
            topic: recommendation.studyTitle,
            materialId: "",
            materialName: recommendation.subject,
          },
          outcome,
          outcome === "correct" ? "normal" : "hard",
        );
        setTopicReviews(nextReviews);

        if (outcome === "correct" && recommendation.pendingErrorsCount > 0) {
          const nextErrors = await ErrorNotebookStorage.markStudyPendingReviewed(
            recommendation.studyId,
            "reviewed",
          );
          setRawErrors(nextErrors);
        }
      }, message);
    },
    [enqueueOperation],
  );

  const summary = useMemo(() => {
    const criticalCount = difficultyItems.filter((item) => item.level === "critical").length;
    const attentionCount = difficultyItems.filter((item) => item.level === "attention").length;
    const masteredCount = difficultyItems.filter((item) => item.level === "mastered").length;
    const insufficientCount = difficultyItems.filter((item) => item.level === "insufficient_data").length;
    const pendingErrorsCount = entries.filter((entry) => entry.status === "pending").length;
    const reviewedErrorsCount = entries.filter((entry) => entry.status === "reviewed").length;
    const resolvedErrorsCount = entries.filter((entry) => entry.status === "resolved").length;

    return {
      totalStudies: studies.length,
      criticalCount,
      attentionCount,
      masteredCount,
      insufficientCount,
      pendingErrorsCount,
      reviewedErrorsCount,
      resolvedErrorsCount,
      recommendationsCount: recommendations.length,
    };
  }, [difficultyItems, entries, recommendations.length, studies.length]);

  const isLoading = auxLoading || studiesLoading || !flashcardsReady || learningLoading;
  const resolvedError =
    error ??
    (studiesError instanceof Error
      ? studiesError.message
      : studiesError
        ? String(studiesError)
        : null);

  return {
    studies,
    entries,
    difficultyItems,
    recommendations,
    summary,
    isLoading,
    isSaving,
    error: resolvedError,
    statusMessage,
    setStatusMessage,
    addManualEntry,
    markErrorStatus,
    removeEntry,
    completeTargetedReview,
  };
}
