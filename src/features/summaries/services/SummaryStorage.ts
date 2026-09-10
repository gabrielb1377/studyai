import type { StudySummary } from "@/types/summary";
import { readLocalStorage, writeLocalStorage } from "@/lib/local-storage";

const STORAGE_KEY = "studyai:summaries";
const UPDATE_EVENT = "studyai:summaries-updated";

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
  load(): StudySummary[] | null {
    return readLocalStorage(STORAGE_KEY, isSummaryList);
  },

  save(summaries: readonly StudySummary[]) {
    writeLocalStorage(STORAGE_KEY, summaries, UPDATE_EVENT);
  },
};
