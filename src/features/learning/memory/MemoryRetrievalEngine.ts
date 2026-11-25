import type { ErrorNotebookEntry } from "@/features/learning/errors/types";
import type { TutorMemoryContext } from "@/types/tutor-context";
import {
  isMemoryExpired,
  isMemoryStale,
  sanitizeMemoryText,
} from "./MemoryValidation";
import type { LongTermMemoryEntry, LongTermMemoryStoreState } from "./types";

export const MAX_PROMPT_MEMORIES = 5;
export const MAX_PROMPT_ERRORS = 3;
export const MAX_PROMPT_MEMORY_CHARS = 1_200;

export type MemoryRetrievalInput = {
  state: LongTermMemoryStoreState;
  errorEntries?: readonly ErrorNotebookEntry[];
  studyId?: string;
  subject?: string;
  query?: string;
  now?: Date;
};

function scoreRelevance(
  entry: LongTermMemoryEntry,
  input: MemoryRetrievalInput,
  now: Date,
): number {
  let score = 0;
  if (input.studyId && entry.studyId === input.studyId) {
    score += 50;
  } else if (
    input.subject &&
    entry.subject &&
    entry.subject.trim().toLowerCase() === input.subject.trim().toLowerCase()
  ) {
    score += 25;
  } else if (!entry.studyId) {
    score += 15;
  }

  if (entry.source === "explicit") score += 20;
  if (entry.category === "preference" || entry.category === "goal") score += 12;
  if (entry.category === "difficulty") score += 10;

  if (input.query) {
    const terms = input.query
      .toLowerCase()
      .split(/\s+/)
      .filter((term) => term.length >= 4)
      .slice(0, 6);
    const haystack = `${entry.title} ${entry.content}`.toLowerCase();
    for (const term of terms) {
      if (haystack.includes(term)) score += 8;
    }
  }

  if (isMemoryStale(entry, now)) {
    score -= 25;
  }

  return score;
}

export const MemoryRetrievalEngine = {
  selectForTutor(input: MemoryRetrievalInput): TutorMemoryContext | undefined {
    const now = input.now ?? new Date();
    if (!input.state.settings.enabled) {
      return undefined;
    }

    const eligible = input.state.entries.filter(
      (entry) => !isMemoryExpired(entry, now) && !entry.sourceUnavailable,
    );

    const ranked = eligible
      .map((entry) => ({
        entry,
        score: scoreRelevance(entry, input, now),
        stale: isMemoryStale(entry, now),
      }))
      .filter(({ score, stale }) => !stale || score >= 25)
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return right.entry.updatedAt.localeCompare(left.entry.updatedAt);
      });

    const selectedItems: TutorMemoryContext["items"] = [];
    let usedChars = 0;

    for (const { entry, stale } of ranked) {
      if (selectedItems.length >= MAX_PROMPT_MEMORIES) break;
      const title = sanitizeMemoryText(entry.title, 100);
      const content = sanitizeMemoryText(entry.content, 240);
      const nextCost = title.length + content.length;
      if (usedChars + nextCost > MAX_PROMPT_MEMORY_CHARS) break;
      usedChars += nextCost;
      selectedItems.push({
        category: entry.category,
        source: entry.source,
        title,
        content,
        updatedAt: entry.updatedAt,
        stale,
      });
    }

    const pendingErrors = (input.errorEntries ?? [])
      .filter((entry) => {
        if (entry.status !== "pending" || entry.sourceUnavailable) return false;
        if (input.studyId && entry.studyId === input.studyId) return true;
        if (
          input.subject &&
          entry.subject.trim().toLowerCase() === input.subject.trim().toLowerCase()
        ) {
          return true;
        }
        return false;
      })
      .sort((left, right) => {
        if (right.occurrences !== left.occurrences) return right.occurrences - left.occurrences;
        return right.lastOccurredAt.localeCompare(left.lastOccurredAt);
      })
      .slice(0, MAX_PROMPT_ERRORS)
      .map((entry) => ({
        topic: sanitizeMemoryText(entry.topic, 80, entry.subject),
        prompt: sanitizeMemoryText(entry.questionPrompt, 160),
        occurrences: entry.occurrences,
      }))
      .filter((entry) => entry.prompt.length > 0);

    if (
      !input.state.settings.explanationLevel &&
      selectedItems.length === 0 &&
      pendingErrors.length === 0
    ) {
      return undefined;
    }

    return {
      enabled: true,
      explanationLevel: input.state.settings.explanationLevel,
      items: selectedItems,
      pendingErrors,
    };
  },
};
