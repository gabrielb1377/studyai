export type FlashcardDifficulty = "easy" | "medium" | "hard";

export type Flashcard = {
  id: string;
  studyId: string;
  question: string;
  answer: string;
  difficulty: FlashcardDifficulty;
  createdAt: string;
  updatedAt: string;
  correctAnswers: number;
  wrongAnswers: number;
  lastReviewedAt?: string;
};
