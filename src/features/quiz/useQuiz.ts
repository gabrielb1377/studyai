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
  const reload = useCallback(() => setStore(QuizService.load()), []);
  useEffect(() => { reload(); window.addEventListener("studyai:quiz-updated", reload); return () => window.removeEventListener("studyai:quiz-updated", reload); }, [reload]);
  const update = useCallback((updater: (current: QuizStore) => QuizStore) => setStore((current) => { const next = updater(current); QuizService.save(next); return next; }), []);
  const questions = useMemo(() => studyId ? store.questions.filter((question) => question.studyId === studyId) : store.questions, [store.questions, studyId]);
  const results = useMemo(() => studyId ? store.results.filter((result) => result.studyId === studyId) : store.results, [store.results, studyId]);
  const generate = async (study: Pick<StudyRecord, "studyId" | "title" | "subject">) => {
    if (isGenerating) return false;
    setError(null); setIsGenerating(true);
    try { const generated = await QuizService.requestGeneration(study); update((current) => ({ ...current, questions: [...current.questions, ...QuizService.createQuestions(study.studyId, generated)] })); return true; }
    catch (generationError) { setError(generationError instanceof Error ? generationError.message : "Erro inesperado ao criar o quiz."); return false; }
    finally { setIsGenerating(false); }
  };
  return { questions, results, isGenerating, error, generate, saveResult: (result: QuizResult) => update((current) => ({ ...current, results: [result, ...current.results] })), clearError: () => setError(null) };
}
