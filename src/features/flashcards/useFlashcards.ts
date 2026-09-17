"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Flashcard } from "@/types/flashcard";
import type { StudyRecord } from "@/types/study-engine";
import { FlashcardService } from "./FlashcardService";

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
    review: (cardId: string, wasCorrect: boolean) => updateCards((current) => FlashcardService.review(current, cardId, wasCorrect)),
    clearError: () => setError(null),
  };
}
