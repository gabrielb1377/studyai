"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EXAM_UPDATED_EVENT, ExamService, daysUntilExam } from "@/features/exam/ExamService";
import { useFlashcards } from "@/features/flashcards/useFlashcards";
import { ReviewScheduler } from "@/features/learning/ReviewScheduler";
import { reviewPeriod, type TopicReview } from "@/features/learning/TopicReview";
import { TopicReviewStorage } from "@/features/learning/TopicReviewStorage";
import { ERROR_NOTEBOOK_UPDATED_EVENT, ErrorNotebookStorage } from "@/features/learning/errors/ErrorNotebookStorage";
import type { ErrorNotebookEntry } from "@/features/learning/errors/types";
import { useLearningEngine } from "@/features/learning/hooks/useLearningEngine";
import { useQuiz } from "@/features/quiz/useQuiz";
import { useStudyEngine } from "@/features/study/hooks/useStudyEngine";
import { STORAGE_UPDATED_EVENT } from "@/lib/storage/StorageManager";
import type { Exam } from "@/types/exam";
import { PlanningEngine } from "../PlanningEngine";
import { PLANNING_UPDATED_EVENT, PlanningStorage } from "../PlanningStorage";
import {
  clampDailyMinutes,
  clampHorizonDays,
  clampItemMinutes,
  createDefaultPlanConfig,
  sanitizeText,
} from "../PlanningValidation";
import type { PlanningPriority, StudyPlan, StudyPlanConfig } from "../types";

export function useStudyPlan(requestedExamId?: string) {
  const { records: studies, isLoading: studiesLoading, error: studiesError } = useStudyEngine();
  const { cards: flashcards, isReady: flashcardsReady } = useFlashcards();
  const { results: quizzes } = useQuiz();
  const { profile, knowledge, priorities, isLoading: learningLoading } = useLearningEngine(
    studies,
    flashcards,
    quizzes,
  );

  const [exams, setExams] = useState<Exam[]>([]);
  const [topicReviews, setTopicReviews] = useState<TopicReview[]>([]);
  const [errorEntries, setErrorEntries] = useState<ErrorNotebookEntry[]>([]);
  const [savedPlan, setSavedPlan] = useState<StudyPlan | null>(null);
  const savedPlanRef = useRef<StudyPlan | null>(null);
  const [configDraft, setConfigDraft] = useState<StudyPlanConfig>(createDefaultPlanConfig);
  const [planLoading, setPlanLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const requestedHandledRef = useRef(false);

  const commitLocalPlan = useCallback((next: StudyPlan | null) => {
    savedPlanRef.current = next;
    setSavedPlan(next);
  }, []);

  const loadAuxData = useCallback(async () => {
    try {
      const [loadedReviews, loadedPlan, loadedErrors] = await Promise.all([
        TopicReviewStorage.load(),
        PlanningStorage.load(),
        ErrorNotebookStorage.load(),
      ]);
      setTopicReviews(loadedReviews);
      setErrorEntries(loadedErrors);
      setExams(ExamService.load());
      commitLocalPlan(loadedPlan);
      if (loadedPlan) {
        setConfigDraft({
          title: loadedPlan.title,
          goal: loadedPlan.goal,
          dailyMinutes: loadedPlan.dailyMinutes,
          horizonDays: loadedPlan.horizonDays,
          includeExams: loadedPlan.includeExams,
          preferredFocus: loadedPlan.preferredFocus,
          selectedStudyIds: loadedPlan.selectedStudyIds,
          manualStudyPriorities: loadedPlan.manualStudyPriorities,
        });
      }
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível carregar o plano de estudos.");
    } finally {
      setPlanLoading(false);
    }
  }, [commitLocalPlan]);

  useEffect(() => {
    void loadAuxData();
    const reload = () => {
      void loadAuxData();
    };
    const reloadExams = () => {
      setExams(ExamService.load());
    };
    window.addEventListener(STORAGE_UPDATED_EVENT, reload);
    window.addEventListener(EXAM_UPDATED_EVENT, reloadExams);
    window.addEventListener(PLANNING_UPDATED_EVENT, reload);
    window.addEventListener(ERROR_NOTEBOOK_UPDATED_EVENT, reload);
    return () => {
      window.removeEventListener(STORAGE_UPDATED_EVENT, reload);
      window.removeEventListener(EXAM_UPDATED_EVENT, reloadExams);
      window.removeEventListener(PLANNING_UPDATED_EVENT, reload);
      window.removeEventListener(ERROR_NOTEBOOK_UPDATED_EVENT, reload);
    };
  }, [loadAuxData]);

  useEffect(() => {
    if (!requestedExamId || requestedHandledRef.current || exams.length === 0) return;
    const exam = exams.find((entry) => entry.id === requestedExamId);
    if (!exam) return;
    requestedHandledRef.current = true;
    setConfigDraft((current) => ({
      ...current,
      includeExams: true,
      preferredFocus: "exams",
      dailyMinutes: clampDailyMinutes(exam.dailyMinutes || current.dailyMinutes, current.dailyMinutes),
      goal: current.goal || `Preparação para ${exam.title}`,
    }));
  }, [exams, requestedExamId]);

  const plan = useMemo(() => {
    if (!savedPlan) return null;
    if (studiesLoading) return savedPlan;
    return PlanningEngine.reconcileWithCurrentSources(savedPlan, studies, exams);
  }, [exams, savedPlan, studies, studiesLoading]);

  const enqueuePersist = useCallback(
    (nextPlan: StudyPlan, successText: string) => {
      commitLocalPlan(nextPlan);
      setIsSaving(true);
      setError(null);
      const task = saveChainRef.current.then(async () => {
        const persisted = await PlanningStorage.save(nextPlan);
        commitLocalPlan(persisted);
        setStatusMessage(successText);
      });
      saveChainRef.current = task.catch((caught) => {
        setError(caught instanceof Error ? caught.message : "Falha ao salvar alterações do plano.");
      }).finally(() => {
        setIsSaving(false);
      });
      return task;
    },
    [commitLocalPlan],
  );

  const updateConfig = useCallback((patch: Partial<StudyPlanConfig>) => {
    setConfigDraft((current) => ({
      ...current,
      ...patch,
      dailyMinutes:
        patch.dailyMinutes !== undefined
          ? clampDailyMinutes(patch.dailyMinutes, current.dailyMinutes)
          : current.dailyMinutes,
      horizonDays:
        patch.horizonDays !== undefined
          ? clampHorizonDays(patch.horizonDays, current.horizonDays)
          : current.horizonDays,
      title:
        patch.title !== undefined
          ? patch.title.slice(0, 100)
          : current.title,
      goal:
        patch.goal !== undefined
          ? patch.goal.slice(0, 240)
          : current.goal,
    }));
  }, []);

  const toggleStudySelection = useCallback((studyId: string) => {
    setConfigDraft((current) => {
      const exists = current.selectedStudyIds.includes(studyId);
      const selectedStudyIds = exists
        ? current.selectedStudyIds.filter((id) => id !== studyId)
        : [...current.selectedStudyIds, studyId];
      return { ...current, selectedStudyIds };
    });
  }, []);

  const setManualStudyPriority = useCallback((studyId: string, priority: PlanningPriority | "auto") => {
    setConfigDraft((current) => {
      const next = { ...current.manualStudyPriorities };
      if (priority === "auto") {
        delete next[studyId];
      } else {
        next[studyId] = priority;
      }
      return { ...current, manualStudyPriorities: next };
    });
  }, []);

  const generatePlan = useCallback(
    async (overrideConfig?: Partial<StudyPlanConfig>) => {
      if (isSaving) return;
      const mergedConfig: StudyPlanConfig = {
        ...configDraft,
        ...overrideConfig,
        title: sanitizeText(overrideConfig?.title ?? configDraft.title, 100, "Plano de Estudos") || "Plano de Estudos",
        goal: sanitizeText(overrideConfig?.goal ?? configDraft.goal, 240, ""),
      };
      setConfigDraft(mergedConfig);

      const generated = PlanningEngine.generate(
        mergedConfig,
        {
          studies,
          profile,
          flashcards,
          quizzes,
          topicReviews,
          exams,
          errorEntries,
        },
        savedPlan,
      );
      await enqueuePersist(
        generated,
        savedPlan ? "Plano atualizado com prioridades reais." : "Plano inteligente criado e salvo.",
      );
    },
    [configDraft, enqueuePersist, errorEntries, exams, flashcards, isSaving, profile, quizzes, savedPlan, studies, topicReviews],
  );

  const toggleItemCompleted = useCallback(
    async (itemId: string) => {
      const current = savedPlanRef.current;
      if (!current) return;
      const nowIso = new Date().toISOString();
      const nextItems = current.items.map((item) => {
        if (item.id !== itemId) return item;
        const completed = !item.completed;
        return {
          ...item,
          completed,
          completedAt: completed ? nowIso : undefined,
        };
      });
      await enqueuePersist({ ...current, items: nextItems }, "Progresso do plano salvo.");
    },
    [enqueuePersist],
  );

  const updateItemPriority = useCallback(
    async (itemId: string, priority: PlanningPriority) => {
      const current = savedPlanRef.current;
      if (!current) return;
      const nextItems = current.items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              priority,
              priorityScore: priority === "high" ? Math.max(item.priorityScore, 80) : priority === "medium" ? 55 : Math.min(item.priorityScore, 35),
            }
          : item,
      );
      await enqueuePersist({ ...current, items: nextItems }, "Prioridade da atividade atualizada.");
    },
    [enqueuePersist],
  );

  const updateItemDuration = useCallback(
    async (itemId: string, minutes: number) => {
      const current = savedPlanRef.current;
      if (!current) return;
      const estimatedMinutes = clampItemMinutes(minutes, 25);
      const nextItems = current.items.map((item) =>
        item.id === itemId ? { ...item, estimatedMinutes } : item,
      );
      await enqueuePersist({ ...current, items: nextItems }, "Duração ajustada.");
    },
    [enqueuePersist],
  );

  const moveItem = useCallback(
    async (itemId: string, direction: "up" | "down") => {
      const current = savedPlanRef.current;
      if (!current) return;
      const index = current.items.findIndex((item) => item.id === itemId);
      if (index === -1) return;
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= current.items.length) return;

      const currentItem = current.items[index];
      const targetItem = current.items[targetIndex];
      const nextItems = [...current.items];
      nextItems[index] = {
        ...targetItem,
        dayOffset: currentItem.dayOffset,
        dateStr: currentItem.dateStr,
      };
      nextItems[targetIndex] = {
        ...currentItem,
        dayOffset: targetItem.dayOffset,
        dateStr: targetItem.dateStr,
      };

      await enqueuePersist({ ...current, items: nextItems }, "Ordem das atividades salva.");
    },
    [enqueuePersist],
  );

  const clearPlan = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    try {
      await PlanningStorage.clear();
      commitLocalPlan(null);
      setStatusMessage("Plano removido.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível remover o plano.");
    } finally {
      setIsSaving(false);
    }
  }, [commitLocalPlan]);

  const summary = useMemo(() => {
    const now = new Date();
    const upcomingExams = exams.filter((exam) => {
      const days = daysUntilExam(exam.examDate, now);
      return days !== null && days >= 0;
    });
    const dueFlashcards = flashcards.filter((card) => ReviewScheduler.isDue(card, now)).length;
    const dueReviews = topicReviews.filter((review) => {
      const period = reviewPeriod(review.nextReviewAt, now);
      return period === "late" || period === "today";
    }).length;
    const items = plan?.items ?? [];
    const completedItems = items.filter((item) => item.completed).length;
    const totalMinutes = items.reduce((sum, item) => sum + item.estimatedMinutes, 0);
    const unavailableItems = items.filter((item) => item.sourceUnavailable).length;
    const pendingErrorsCount = errorEntries.filter((entry) => entry.status === "pending").length;

    return {
      totalStudies: studies.length,
      upcomingExamsCount: upcomingExams.length,
      dueFlashcardsCount: dueFlashcards,
      dueReviewsCount: dueReviews,
      pendingErrorsCount,
      plannedItemsCount: items.length,
      completedItemsCount: completedItems,
      totalMinutes,
      unavailableItemsCount: unavailableItems,
    };
  }, [errorEntries, exams, flashcards, plan, studies.length, topicReviews]);

  const isLoading = planLoading || studiesLoading || !flashcardsReady || learningLoading;
  const resolvedError = error ?? (studiesError instanceof Error ? studiesError.message : studiesError ? String(studiesError) : null);

  return {
    plan,
    studies,
    exams,
    knowledge,
    priorities,
    configDraft,
    summary,
    isLoading,
    isSaving,
    error: resolvedError,
    statusMessage,
    setStatusMessage,
    updateConfig,
    toggleStudySelection,
    setManualStudyPriority,
    generatePlan,
    toggleItemCompleted,
    updateItemPriority,
    updateItemDuration,
    moveItem,
    clearPlan,
  };
}
