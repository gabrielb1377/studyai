"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deriveSafeMemorySignals,
  selectAdaptiveSkill,
  type AdaptiveActivityGoal,
  type AdaptiveSkillRecommendation,
} from "@/features/ai/skills";
import { useFlashcards } from "@/features/flashcards/useFlashcards";
import type { TopicReview } from "@/features/learning/TopicReview";
import { TopicReviewStorage } from "@/features/learning/TopicReviewStorage";
import { useLearningEngine } from "@/features/learning/hooks/useLearningEngine";
import { useQuiz } from "@/features/quiz/useQuiz";
import { useStudyEngine } from "@/features/study/hooks/useStudyEngine";
import { SessionOperationManager } from "@/features/account/SessionOperationManager";
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
import {
  LONG_TERM_MEMORY_UPDATED_EVENT,
  LongTermMemoryStorage,
} from "../memory/LongTermMemoryStorage";
import type {
  ExplanationLevel,
  LongTermMemoryStoreState,
  MemoryCategory,
} from "../memory/types";
import { AdaptiveAssessmentEngine } from "../adaptive/AdaptiveAssessmentEngine";

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
  const [memoryState, setMemoryState] = useState<LongTermMemoryStoreState>({
    settings: { enabled: true, adaptivePersonalizationEnabled: true },
    entries: [],
  });
  const [adaptiveGoal, setAdaptiveGoal] = useState<AdaptiveActivityGoal>("learn");
  const [auxLoading, setAuxLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const loadSeqRef = useRef(0);

  const loadAuxData = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    const sessionBefore = SessionOperationManager.current();
    try {
      const [loadedErrors, loadedReviews, loadedMemory] = await Promise.all([
        ErrorNotebookStorage.load(),
        TopicReviewStorage.load(),
        LongTermMemoryStorage.load(),
      ]);
      const sessionAfter = SessionOperationManager.current();
      if (
        seq !== loadSeqRef.current ||
        sessionAfter.generation !== sessionBefore.generation ||
        sessionAfter.userId !== sessionBefore.userId
      ) {
        return;
      }
      setRawErrors(loadedErrors);
      setTopicReviews(loadedReviews);
      setMemoryState(loadedMemory);
      setError(null);
    } catch (caught) {
      const sessionAfter = SessionOperationManager.current();
      if (
        seq !== loadSeqRef.current ||
        sessionAfter.generation !== sessionBefore.generation ||
        sessionAfter.userId !== sessionBefore.userId
      ) {
        return;
      }
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível carregar os dados do Caderno de Erros.",
      );
    } finally {
      const sessionAfter = SessionOperationManager.current();
      if (
        seq === loadSeqRef.current &&
        sessionAfter.generation === sessionBefore.generation &&
        sessionAfter.userId === sessionBefore.userId
      ) {
        setAuxLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadAuxData();
    const reload = (event?: Event) => {
      const detail = (event as CustomEvent<{ scopeChanged?: boolean }> | undefined)?.detail;
      if (detail?.scopeChanged) {
        loadSeqRef.current += 1;
        setRawErrors([]);
        setTopicReviews([]);
        setMemoryState({
          settings: { enabled: true, adaptivePersonalizationEnabled: true },
          entries: [],
        });
      }
      void loadAuxData();
    };
    window.addEventListener(STORAGE_UPDATED_EVENT, reload);
    window.addEventListener(ERROR_NOTEBOOK_UPDATED_EVENT, reload);
    window.addEventListener(LONG_TERM_MEMORY_UPDATED_EVENT, reload);
    return () => {
      loadSeqRef.current += 1;
      window.removeEventListener(STORAGE_UPDATED_EVENT, reload);
      window.removeEventListener(ERROR_NOTEBOOK_UPDATED_EVENT, reload);
      window.removeEventListener(LONG_TERM_MEMORY_UPDATED_EVENT, reload);
    };
  }, [loadAuxData]);

  const entries = useMemo(() => {
    if (studiesLoading) return rawErrors;
    return ErrorNotebookStorage.reconcileWithStudies(rawErrors, studies);
  }, [rawErrors, studies, studiesLoading]);

  const memories = useMemo(() => {
    if (studiesLoading) return memoryState.entries;
    return LongTermMemoryStorage.reconcileWithStudies(memoryState.entries, studies);
  }, [memoryState.entries, studies, studiesLoading]);

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

  const toggleMemoryEnabled = useCallback(
    async (enabled: boolean) => {
      await enqueueOperation(async () => {
        const next = await LongTermMemoryStorage.setEnabled(enabled);
        setMemoryState(next);
      }, enabled ? "Memória de longo prazo ativada." : "Memória de longo prazo desativada.");
    },
    [enqueueOperation],
  );

  const toggleAdaptivePersonalization = useCallback(
    async (enabled: boolean) => {
      await enqueueOperation(
        async () => {
          const next = await LongTermMemoryStorage.setAdaptivePersonalizationEnabled(enabled);
          setMemoryState(next);
        },
        enabled
          ? "Personalização adaptativa ativada."
          : "Personalização adaptativa desativada; seleção manual preservada.",
      );
    },
    [enqueueOperation],
  );

  const setExplanationLevel = useCallback(
    async (level: ExplanationLevel | undefined) => {
      await enqueueOperation(async () => {
        const next = await LongTermMemoryStorage.setExplanationLevel(level);
        setMemoryState(next);
      }, "Preferência de nível de explicação salva.");
    },
    [enqueueOperation],
  );

  const addExplicitMemory = useCallback(
    async (draft: {
      category: MemoryCategory;
      studyId?: string;
      title: string;
      content: string;
    }) => {
      const linkedStudy = draft.studyId
        ? studies.find((study) => study.studyId === draft.studyId)
        : undefined;
      await enqueueOperation(async () => {
        const next = await LongTermMemoryStorage.addMemory({
          category: draft.category,
          source: "explicit",
          studyId: linkedStudy?.studyId,
          studyTitle: linkedStudy?.title,
          subject: linkedStudy?.subject,
          title: draft.title,
          content: draft.content,
        });
        setMemoryState(next);
      }, "Memória salva com sucesso.");
    },
    [enqueueOperation, studies],
  );

  const updateMemory = useCallback(
    async (id: string, patch: { title?: string; content?: string }) => {
      await enqueueOperation(async () => {
        const next = await LongTermMemoryStorage.updateMemory(id, patch);
        setMemoryState(next);
      }, "Memória atualizada.");
    },
    [enqueueOperation],
  );

  const removeMemory = useCallback(
    async (id: string) => {
      await enqueueOperation(async () => {
        const next = await LongTermMemoryStorage.removeMemory(id);
        setMemoryState(next);
      }, "Memória removida do armazenamento local.");
    },
    [enqueueOperation],
  );

  const clearAllMemories = useCallback(async () => {
    await enqueueOperation(async () => {
      const next = await LongTermMemoryStorage.clearAll();
      setMemoryState(next);
    }, "Todas as memórias locais foram removidas.");
  }, [enqueueOperation]);

  const assessmentIndicator = useMemo(
    () =>
      AdaptiveAssessmentEngine.computeReliableIndicators({
        quizzes,
        flashcards,
        errorEntries: entries,
      }),
    [entries, flashcards, quizzes],
  );

  const adaptiveRecommendationsByStudyId = useMemo(() => {
    const map: Record<string, AdaptiveSkillRecommendation> = {};
    const reconciledMemoryState: LongTermMemoryStoreState = {
      settings: memoryState.settings,
      entries: memories,
    };
    for (const item of difficultyItems) {
      const topicMetrics = profile.topics[item.study.studyId];
      const memorySignals = deriveSafeMemorySignals(reconciledMemoryState, {
        studyId: item.study.studyId,
        subject: item.study.subject,
      });
      map[item.study.studyId] = selectAdaptiveSkill({
        goal: adaptiveGoal,
        personalizationEnabled: memoryState.settings.adaptivePersonalizationEnabled !== false,
        memoryEnabled: memoryState.settings.enabled,
        memorySettings: memoryState.settings,
        study: item.study,
        knowledge: item.knowledge,
        difficultyItem: item,
        priority: item.priority,
        observedPerformance: {
          quizAttempts: item.evolution.quizAttempts,
          averageScore: item.evolution.latestScore,
          totalStudyMinutes: topicMetrics?.timeMinutes ?? 0,
          dueFlashcardsCount: item.dueFlashcardsCount,
          pendingErrorsCount: item.pendingErrorsCount,
        },
        memorySignals,
      });
    }
    return map;
  }, [adaptiveGoal, difficultyItems, memories, memoryState.settings, profile.topics]);

  return {
    studies,
    entries,
    memories,
    memorySettings: memoryState.settings,
    difficultyItems,
    recommendations,
    adaptiveGoal,
    setAdaptiveGoal,
    adaptiveRecommendationsByStudyId,
    assessmentIndicator,
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
    toggleMemoryEnabled,
    toggleAdaptivePersonalization,
    setExplanationLevel,
    addExplicitMemory,
    updateMemory,
    removeMemory,
    clearAllMemories,
  };
}
