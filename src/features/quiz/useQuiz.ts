"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { QuizQuestion, QuizResult } from "@/types/quiz";
import type { StudyRecord } from "@/types/study-engine";
import { QuizService } from "./QuizService";

type QuizStore = { questions: QuizQuestion[]; results: QuizResult[] };

export function useQuiz(studyId?: string) {
  const [store, setStore] = useState<QuizStore>({ questions: [], results: [] });
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => setStore(await QuizService.load()), []);

  useEffect(() => {
    void reload();
    const handleReload = () => { void reload(); };
    window.addEventListener("studyai:quiz-updated", handleReload);
    return () => window.removeEventListener("studyai:quiz-updated", handleReload);
  }, [reload]);

  const updateStore = useCallback(
    (updater: (current: QuizStore) => QuizStore) => {
      setStore((current) => {
        const nextStore = updater(current);
        void QuizService.save(nextStore);
        return nextStore;
      });
    },
    [],
  );

  const questions = useMemo(
    () => studyId
      ? store.questions.filter((question) => question.studyId === studyId)
      : store.questions,
    [store.questions, studyId],
  );
  const results = useMemo(
    () => studyId
      ? store.results.filter((result) => result.studyId === studyId)
      : store.results,
    [store.results, studyId],
  );

  const generate = async (study: Pick<StudyRecord, "studyId" | "title" | "subject">) => {
    if (isGenerating) return false;
    setError(null);
    setIsGenerating(true);

    try {
      const generatedQuestions = await QuizService.requestGeneration(study);
      const nextStore = {
        ...store,
        questions: [
          ...store.questions,
          ...QuizService.createQuestions(study.studyId, generatedQuestions),
        ],
      };
      await QuizService.save(nextStore);
      setStore(nextStore);
      return true;
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : "Erro inesperado ao criar o quiz.",
      );
      return false;
    } finally {
      setIsGenerating(false);
    }
  };

  return {
    questions,
    results,
    isGenerating,
    error,
    generate,
    saveResult: (result: QuizResult) =>
      updateStore((current) => ({
        ...current,
        results: [result, ...current.results],
      })),
    clearError: () => setError(null),
  };
}
