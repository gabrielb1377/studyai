import type { StudySummary } from "@/types/summary";

const STORAGE_KEY = "studyai:summaries";

function isSummaryList(value: unknown): value is StudySummary[] {
  return Array.isArray(value) && value.every((summary) =>
    typeof summary === "object" && summary !== null &&
    typeof summary.id === "string" && typeof summary.title === "string" &&
    typeof summary.content === "string" && typeof summary.conversationId === "string" &&
    typeof summary.createdAt === "string" && typeof summary.updatedAt === "string",
  );
}

export const SummaryStorage = {
  load(): StudySummary[] | null {
    if (typeof window === "undefined") return null;

    try {
      const rawValue = window.localStorage.getItem(STORAGE_KEY);
      if (!rawValue) return null;
      const parsedValue: unknown = JSON.parse(rawValue);
      return isSummaryList(parsedValue) ? parsedValue : null;
    } catch {
      return null;
    }
  },

  save(summaries: readonly StudySummary[]) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(summaries));
  },
};
