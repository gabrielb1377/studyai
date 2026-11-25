export type ReviewResult = "correct" | "wrong" | "reviewed";
export type ReviewDifficulty = "normal" | "hard";
export type TopicReview = {
  discipline: string;
  studyId: string;
  topic: string;
  materialId?: string;
  materialName?: string;
  attempts: number;
  correct: number;
  wrong: number;
  streak: number;
  result: ReviewResult;
  difficulty: ReviewDifficulty;
  lastReviewAt: string;
  nextReviewAt: string;
};

const intervals = [1, 3, 7, 14, 30];

export function scheduleTopicReview(
  topic: Pick<TopicReview, "discipline" | "studyId" | "topic" | "materialId" | "materialName">,
  previous: TopicReview | undefined,
  result: ReviewResult,
  difficulty: ReviewDifficulty,
  now: Date,
): TopicReview {
  const streak = result === "wrong" ? 0 : (previous?.streak ?? 0) + Number(result === "correct");
  const interval = intervals[Math.min(intervals.length - 1, Math.max(0, streak - 1))];
  const days = difficulty === "hard" ? Math.min(3, interval) : interval;
  const next = new Date(now);
  next.setDate(next.getDate() + days);
  return {
    ...topic, streak, result, difficulty,
    attempts: (previous?.attempts ?? 0) + 1,
    correct: (previous?.correct ?? 0) + Number(result === "correct"),
    wrong: (previous?.wrong ?? 0) + Number(result === "wrong"),
    lastReviewAt: now.toISOString(), nextReviewAt: next.toISOString(),
  };
}

export function reviewPeriod(date: string | undefined, now: Date) {
  if (!date) return "new";
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const tomorrow = new Date(start);
  tomorrow.setDate(start.getDate() + 1);
  const due = new Date(date).getTime();
  if (due < start.getTime()) return "late";
  return due < tomorrow.getTime() ? "today" : "upcoming";
}
