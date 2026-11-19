"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Flashcard } from "@/types/flashcard";
import type { StudyRecord } from "@/types/study-engine";
import { FlashcardService } from "./FlashcardService";
import { LearningService } from "@/features/learning/LearningService";
import { ErrorNotebookStorage } from "@/features/learning/errors/ErrorNotebookStorage";

export function useFlashcards(studyId?: string) {
  const [allCards, setAllCards] = useState<Flashcard[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void FlashcardService.load().then((cards) => {
      setAllCards(cards);
      setIsReady(true);
    });
  }, []);

  const updateCards = useCallback((updater: (current: Flashcard[]) => Flashcard[]) => {
    setAllCards((current) => {
      const nextCards = updater(current);
      void FlashcardService.save(nextCards);
      return nextCards;
    });
  }, []);

  const generate = async (study: Pick<StudyRecord, "studyId" | "title" | "subject">) => {
    if (isGenerating) return false;
    setError(null);
    setIsGenerating(true);
    try {
      const generatedCards = await FlashcardService.requestGeneration(study);
      const nextCards = [...allCards, ...FlashcardService.create(study.studyId, generatedCards)];
      await FlashcardService.save(nextCards);
      setAllCards(nextCards);
      return true;
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "Erro inesperado ao criar flashcards.");
      return false;
    } finally {
      setIsGenerating(false);
    }
  };

  const cards = useMemo(() => studyId ? allCards.filter((card) => card.studyId === studyId) : allCards, [allCards, studyId]);
  const reviewedCount = cards.reduce((total, card) => total + card.correctAnswers + card.wrongAnswers, 0);

  return {
    cards,
    isReady,
    isGenerating,
    error,
    reviewedCount,
    generate,
    review: (cardId: string, rating: "errei" | "dificil" | "acertei" | boolean) => {
      const card = allCards.find((item) => item.id === cardId);
      const isWrong = typeof rating === "boolean" ? !rating : rating === "errei";
      updateCards((current) => FlashcardService.review(current, cardId, rating));
      if (card) {
        LearningService.enqueueActivity({
          type: "flashcard",
          studyId: card.studyId,
          correctAnswers: isWrong ? 0 : 1,
          wrongAnswers: isWrong ? 1 : 0,
        });
        if (isWrong) {
          void ErrorNotebookStorage.recordEntries([
            {
              studyId: card.studyId,
              source: "flashcard",
              sourceId: card.id,
              questionPrompt: card.question,
              wrongAnswer: "Avaliado como Errei",
              correctAnswer: card.answer,
            },
          ]);
        }
      }
    },
    clearError: () => setError(null),
  };
}
