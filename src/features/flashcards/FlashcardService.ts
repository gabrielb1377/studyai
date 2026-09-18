import type { Flashcard, FlashcardDifficulty } from "@/types/flashcard";
import { StorageManager } from "@/lib/storage/StorageManager";
import { AIClient } from "@/features/ai/AIClient";
import { RetrievalPipeline } from "@/features/ai/RetrievalPipeline";
import { ReviewScheduler } from "@/features/learning/ReviewScheduler";

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
  async load(): Promise<Flashcard[]> {
    const cards = await StorageManager.getAll<unknown>("flashcards");
    return isFlashcardList(cards)
      ? cards.sort((left, right) => ((left as Flashcard & { _storageOrder?: number })._storageOrder ?? Number.MAX_SAFE_INTEGER) -
        ((right as Flashcard & { _storageOrder?: number })._storageOrder ?? Number.MAX_SAFE_INTEGER))
      : [];
  },

  async save(cards: readonly Flashcard[]) {
    await StorageManager.replaceAll("flashcards", cards.map((card, index) => ({ ...card, _storageOrder: index })));
    window.dispatchEvent(new Event("studyai:flashcards-updated"));
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
      easeFactor: 2.5,
      repetitions: 0,
      reviewIntervalDays: 0,
      reviewAlgorithm: "sm2",
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
        ...ReviewScheduler.schedule(card, wasCorrect, new Date(now)),
      }
      : card,
    );
  },

  async requestGeneration({ studyId, title, subject }: { studyId: string; title: string; subject: string }) {
    const chunks = (await RetrievalPipeline.forStudy(studyId)).chunks;
    if (chunks.length === 0) {
      throw new Error("Este estudo ainda não possui conteúdo real extraído para gerar flashcards.");
    }
    const data = await AIClient.request<{ cards?: GeneratedFlashcard[] }>(
      "/api/tutor/flashcards",
      { studyId, title, subject, chunks },
      "Não foi possível criar os flashcards agora.",
    );
    if (!data.cards) throw new Error("O provider retornou flashcards inválidos.");
    return data.cards;
  },
};
