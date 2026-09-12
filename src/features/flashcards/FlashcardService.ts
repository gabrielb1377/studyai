import type { Flashcard, FlashcardDifficulty } from "@/types/flashcard";
import { readLocalStorage, writeLocalStorage } from "@/lib/local-storage";
import { RetrievalService } from "@/features/retrieval/RetrievalService";

const STORAGE_KEY = "studyai:flashcards";

type GeneratedFlashcard = Pick<Flashcard, "question" | "answer" | "difficulty">;

function isDifficulty(value: unknown): value is FlashcardDifficulty {
  return value === "easy" || value === "medium" || value === "hard";
}

function isFlashcardList(value: unknown): value is Flashcard[] {
  return Array.isArray(value) && value.every((card) =>
    typeof card === "object" && card !== null &&
    typeof card.id === "string" && typeof card.studyId === "string" &&
    typeof card.question === "string" && typeof card.answer === "string" &&
    isDifficulty(card.difficulty) && typeof card.createdAt === "string" &&
    typeof card.updatedAt === "string" && typeof card.correctAnswers === "number" &&
    typeof card.wrongAnswers === "number",
  );
}

export const FlashcardService = {
  load(): Flashcard[] {
    return readLocalStorage(STORAGE_KEY, isFlashcardList) ?? [];
  },

  save(cards: readonly Flashcard[]) {
    writeLocalStorage(STORAGE_KEY, cards);
  },

  create(studyId: string, cards: readonly GeneratedFlashcard[], now = new Date().toISOString()): Flashcard[] {
    return cards.map((card) => ({
      id: `flashcard-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      studyId,
      question: card.question,
      answer: card.answer,
      difficulty: card.difficulty,
      createdAt: now,
      updatedAt: now,
      correctAnswers: 0,
      wrongAnswers: 0,
    }));
  },

  review(cards: readonly Flashcard[], cardId: string, wasCorrect: boolean, now = new Date().toISOString()) {
    return cards.map((card) => card.id === cardId
      ? {
        ...card,
        correctAnswers: card.correctAnswers + (wasCorrect ? 1 : 0),
        wrongAnswers: card.wrongAnswers + (wasCorrect ? 0 : 1),
        lastReviewedAt: now,
        updatedAt: now,
      }
      : card,
    );
  },

  async requestGeneration({ studyId, title, subject }: { studyId: string; title: string; subject: string }) {
    const chunks = RetrievalService.forStudy(studyId).chunks;
    if (chunks.length === 0) {
      throw new Error("Este estudo ainda não possui conteúdo real extraído para gerar flashcards.");
    }
    const response = await fetch("/api/tutor/flashcards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studyId, title, subject, chunks }),
    });
    const data = await response.json().catch(() => null) as { cards?: GeneratedFlashcard[]; error?: string } | null;
    if (!response.ok || !data?.cards) throw new Error(data?.error ?? "Não foi possível criar os flashcards agora.");
    return data.cards;
  },
};
