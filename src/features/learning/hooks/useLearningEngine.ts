"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Flashcard } from "@/types/flashcard";
import type { QuizResult } from "@/types/quiz";
import type { StudyRecord } from "@/types/study-engine";
import { KnowledgeEngine } from "../KnowledgeEngine";
import { LearningCalculator } from "../LearningCalculator";
import { createEmptyLearningProfile, LearningStorage } from "../LearningStorage";
import { StudyPriorityEngine } from "../StudyPriorityEngine";

export function useLearningEngine(
  studies: readonly StudyRecord[],
  flashcards: readonly Flashcard[],
  quizzes: readonly QuizResult[],
) {
  const [profile, setProfile] = useState(createEmptyLearningProfile());
  const [isLoading, setIsLoading] = useState(true);
  const refresh = useCallback(async () => {
    setProfile(await LearningStorage.load());
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const reload = () => { void refresh(); };
    window.addEventListener("studyai:learning-updated", reload);
    return () => window.removeEventListener("studyai:learning-updated", reload);
  }, [refresh]);

  const knowledge = useMemo(
    () => studies.map((study) => KnowledgeEngine.calculate(study, profile, flashcards, quizzes)),
    [flashcards, profile, quizzes, studies],
  );
  const priorities = useMemo(() => studies.map((study) => {
    const score = knowledge.find((item) => item.studyId === study.studyId)!;
    return StudyPriorityEngine.calculate(study, score, profile, flashcards);
  }).sort((left, right) => right.score - left.score), [flashcards, knowledge, profile, studies]);

  return {
    profile,
    knowledge,
    priorities,
    dailyPlan: useMemo(() => LearningCalculator.dailyPlan(studies, profile, flashcards, quizzes), [flashcards, profile, quizzes, studies]),
    statistics: useMemo(() => LearningCalculator.statistics(profile, quizzes), [profile, quizzes]),
    isLoading,
    refresh,
  };
}
