"use client";

import { useEffect, useState } from "react";
import { SessionOperationManager } from "@/features/account/SessionOperationManager";
import { FlashcardService } from "@/features/flashcards/FlashcardService";
import { LearningStorage } from "@/features/learning/LearningStorage";
import { QuizService } from "@/features/quiz/QuizService";
import type { Exam } from "@/types/exam";
import type { StudyRecord } from "@/types/study-engine";
import { ExamProgressService, type ExamProgressSnapshot } from "./ExamProgressService";

const progressEvents = [
  "studyai:learning-updated",
  "studyai:quiz-updated",
  "studyai:flashcards-updated",
  "studyai:storage-updated",
] as const;

export function useExamProgress(exam: Exam | undefined, studies: readonly StudyRecord[], sessionOwner?: string) {
  const [snapshot, setSnapshot] = useState<ExamProgressSnapshot>();
  const [isLoading, setIsLoading] = useState(Boolean(exam));
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    let requestVersion = 0;
    const session = SessionOperationManager.current();
    setSnapshot(undefined);
    setError(undefined);
    setIsLoading(Boolean(exam));
    if (!exam || !sessionOwner || session.suspended || session.userId !== sessionOwner) {
      setIsLoading(false);
      return () => { active = false; };
    }

    const refresh = async () => {
      const version = ++requestVersion;
      setError(undefined);
      try {
        const [profile, flashcards, quizStore] = await Promise.all([
          LearningStorage.load(),
          FlashcardService.load(),
          QuizService.load(),
        ]);
        const current = SessionOperationManager.current();
        if (
          !active || version !== requestVersion || current.suspended ||
          current.userId !== session.userId || current.generation !== session.generation
        ) return;
        setSnapshot(ExamProgressService.build({ exam, studies, profile, flashcards, quizzes: quizStore.results }));
        setIsLoading(false);
      } catch {
        const current = SessionOperationManager.current();
        if (
          !active || version !== requestVersion || current.suspended ||
          current.userId !== session.userId || current.generation !== session.generation
        ) return;
        setError("Os registros de progresso não puderam ser carregados agora. Nenhum dado foi alterado.");
        setIsLoading(false);
      }
    };
    const handleRefresh = () => { void refresh(); };
    void refresh();
    for (const eventName of progressEvents) window.addEventListener(eventName, handleRefresh);
    return () => {
      active = false;
      requestVersion += 1;
      for (const eventName of progressEvents) window.removeEventListener(eventName, handleRefresh);
    };
  }, [exam, sessionOwner, studies]);

  return { snapshot, isLoading, error };
}
