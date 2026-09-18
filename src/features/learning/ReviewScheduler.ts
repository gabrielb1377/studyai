import type { Flashcard, ReviewAlgorithm } from "@/types/flashcard";

const DAY = 86_400_000;

export type ReviewSchedule = Pick<Flashcard, "nextReviewAt" | "reviewIntervalDays" | "easeFactor" | "repetitions" | "reviewAlgorithm">;

export const ReviewScheduler = {
  schedule(card: Flashcard, wasCorrect: boolean, now = new Date(), algorithm: ReviewAlgorithm = "sm2"): ReviewSchedule {
    // The contract already carries the algorithm so FSRS can replace the calculation without changing consumers.
    const activeAlgorithm: ReviewAlgorithm = algorithm === "fsrs" ? "sm2" : algorithm;
    const quality = wasCorrect
      ? card.difficulty === "easy" ? 5 : card.difficulty === "hard" ? 3 : 4
      : 1;
    let easeFactor = card.easeFactor ?? 2.5;
    let repetitions = card.repetitions ?? 0;
    let interval = card.reviewIntervalDays ?? 0;

    easeFactor = Math.max(1.3, easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
    if (quality < 3) {
      repetitions = 0;
      interval = 1;
    } else {
      repetitions += 1;
      interval = repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.max(1, Math.round(interval * easeFactor));
    }

    return {
      easeFactor: Number(easeFactor.toFixed(2)),
      repetitions,
      reviewIntervalDays: interval,
      nextReviewAt: new Date(now.getTime() + interval * DAY).toISOString(),
      reviewAlgorithm: activeAlgorithm,
    };
  },

  isDue(card: Flashcard, now = new Date()) {
    return Boolean(card.nextReviewAt && new Date(card.nextReviewAt).getTime() <= now.getTime());
  },

  state(card: Flashcard, now = new Date()): "easy" | "medium" | "hard" | "forgotten" {
    if (card.lastReviewedAt && this.isDue(card, now)) return "forgotten";
    return card.difficulty;
  },
};
