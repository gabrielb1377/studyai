import type { StudySummary } from "@/types/summary";
import { StorageManager } from "@/lib/storage/StorageManager";

export const SUMMARIES_UPDATE_EVENT = "studyai:summaries-updated";

function isSummaryList(value: unknown): value is StudySummary[] {
  return Array.isArray(value) && value.every((summary) =>
    typeof summary === "object" && summary !== null &&
    typeof summary.id === "string" && typeof summary.title === "string" &&
    typeof summary.content === "string" && typeof summary.conversationId === "string" &&
    (summary.studyId === undefined || typeof summary.studyId === "string") &&
    typeof summary.createdAt === "string" && typeof summary.updatedAt === "string",
  );
}

export const SummaryStorage = {
  async load(): Promise<StudySummary[] | null> {
    const summaries = await StorageManager.getAll<unknown>("summaries");
    return isSummaryList(summaries)
      ? summaries.sort((left, right) => ((left as StudySummary & { _storageOrder?: number })._storageOrder ?? Number.MAX_SAFE_INTEGER) -
        ((right as StudySummary & { _storageOrder?: number })._storageOrder ?? Number.MAX_SAFE_INTEGER))
      : null;
  },

  async save(summaries: readonly StudySummary[]) {
    await StorageManager.replaceAll("summaries", summaries.map((summary, index) => ({ ...summary, _storageOrder: index })));
    window.dispatchEvent(new Event(SUMMARIES_UPDATE_EVENT));
  },
};
