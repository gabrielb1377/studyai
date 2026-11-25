import { SessionOperationManager } from "@/features/account/SessionOperationManager";
import { StorageManager } from "@/lib/storage/StorageManager";
import { scheduleTopicReview, type ReviewDifficulty, type ReviewResult, type TopicReview } from "./TopicReview";

const key = "topic-reviews-v1";
type ReviewRecord = { key: string; value: TopicReview[]; updatedAt: string };

export const TopicReviewStorage = {
  async load() {
    const record = await StorageManager.get<ReviewRecord>("metadata", key);
    return Array.isArray(record?.value) ? record.value : [];
  },
  async record(topic: Pick<TopicReview, "discipline" | "studyId" | "topic" | "materialId" | "materialName">, result: ReviewResult, difficulty: ReviewDifficulty) {
    const operation = SessionOperationManager.start();
    try {
      const record = await StorageManager.updateMetadata<ReviewRecord>(key, (current) => {
        operation.assertCurrent();
        const records = current?.value ?? [];
        const matches = (review: TopicReview) => review.studyId === topic.studyId && review.discipline === topic.discipline;
        const updated = scheduleTopicReview(topic, records.find(matches), result, difficulty, new Date());
        return { key, value: [...records.filter((review) => !matches(review)), updated], updatedAt: updated.lastReviewAt };
      });
      operation.assertCurrent();
      return record.value;
    } finally {
      operation.release();
    }
  },
};
