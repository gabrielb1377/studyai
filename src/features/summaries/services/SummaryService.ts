import type { StudySummary } from "@/types/summary";

function createSummaryId() {
  return `summary-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const SummaryService = {
  create({
    conversationId,
    conversationTitle,
    content,
    studyId,
    now = new Date().toISOString(),
  }: {
    conversationId: string;
    conversationTitle: string;
    content: string;
    studyId?: string;
    now?: string;
  }): StudySummary {
    return {
      id: createSummaryId(),
      title: `Resumo — ${conversationTitle}`,
      content,
      conversationId,
      studyId,
      createdAt: now,
      updatedAt: now,
    };
  },

  save(summaries: readonly StudySummary[], summary: StudySummary, now = new Date().toISOString()) {
    const nextSummary = { ...summary, title: summary.title.trim(), updatedAt: now };
    const hasSummary = summaries.some((item) => item.id === summary.id);
    return hasSummary
      ? summaries.map((item) => item.id === summary.id ? nextSummary : item)
      : [nextSummary, ...summaries];
  },

  remove(summaries: readonly StudySummary[], summaryId: string) {
    return summaries.filter((summary) => summary.id !== summaryId);
  },
};
