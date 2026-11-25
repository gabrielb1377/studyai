import { SessionOperationManager } from "@/features/account/SessionOperationManager";
import { StorageManager } from "@/lib/storage/StorageManager";
import type { StudyRecord } from "@/types/study-engine";
import {
  MAX_ERROR_ENTRIES,
  normalizeCreateErrorInput,
  sanitizeErrorNotebookList,
} from "./ErrorNotebookValidation";
import type {
  CreateErrorEntryInput,
  ErrorNotebookEntry,
  ErrorReviewStatus,
} from "./types";

const NOTEBOOK_KEY = "error-notebook-v1";
export const ERROR_NOTEBOOK_UPDATED_EVENT = "studyai:error-notebook-updated";

type ErrorNotebookRecord = {
  key: typeof NOTEBOOK_KEY;
  value: ErrorNotebookEntry[];
  updatedAt: string;
};

function notifyUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ERROR_NOTEBOOK_UPDATED_EVENT));
  }
}

export function mergeErrorEntries(
  existing: readonly ErrorNotebookEntry[],
  inputs: readonly CreateErrorEntryInput[],
  nowIso = new Date().toISOString(),
): ErrorNotebookEntry[] {
  const byKey = new Map<string, ErrorNotebookEntry>(
    existing.map((entry) => [entry.dedupeKey, entry]),
  );

  for (const input of inputs) {
    const normalized = normalizeCreateErrorInput(input, nowIso);
    if (!normalized) continue;
    const current = byKey.get(normalized.dedupeKey);
    if (!current) {
      byKey.set(normalized.dedupeKey, normalized);
      continue;
    }

    byKey.set(normalized.dedupeKey, {
      ...current,
      studyId: normalized.studyId ?? current.studyId,
      studyTitle: normalized.studyTitle !== "Estudo" ? normalized.studyTitle : current.studyTitle,
      subject: normalized.subject !== "Geral" ? normalized.subject : current.subject,
      topic: normalized.topic || current.topic,
      wrongAnswer: normalized.wrongAnswer || current.wrongAnswer,
      correctAnswer: normalized.correctAnswer ?? current.correctAnswer,
      explanation: normalized.explanation ?? current.explanation,
      occurrences: Math.min(999, current.occurrences + 1),
      status: "pending",
      lastOccurredAt: normalized.lastOccurredAt,
    });
  }

  return [...byKey.values()]
    .sort((left, right) => right.lastOccurredAt.localeCompare(left.lastOccurredAt))
    .slice(0, MAX_ERROR_ENTRIES);
}

export const ErrorNotebookStorage = {
  async load(): Promise<ErrorNotebookEntry[]> {
    const session = SessionOperationManager.current();
    if (session.suspended) return [];

    const record = await StorageManager.get<ErrorNotebookRecord>("metadata", NOTEBOOK_KEY);
    return sanitizeErrorNotebookList(record?.value);
  },

  async recordEntries(inputs: readonly CreateErrorEntryInput[]): Promise<ErrorNotebookEntry[]> {
    if (inputs.length === 0) return ErrorNotebookStorage.load();

    const operation = SessionOperationManager.start();
    try {
      const nowIso = new Date().toISOString();
      const record = await StorageManager.updateMetadata<ErrorNotebookRecord>(
        NOTEBOOK_KEY,
        (current) => {
          operation.assertCurrent();
          const currentEntries = sanitizeErrorNotebookList(current?.value);
          const merged = mergeErrorEntries(currentEntries, inputs, nowIso);
          return {
            key: NOTEBOOK_KEY,
            value: merged,
            updatedAt: nowIso,
          };
        },
      );
      operation.assertCurrent();
      notifyUpdated();
      return record.value;
    } finally {
      operation.release();
    }
  },

  async addManualEntry(input: Omit<CreateErrorEntryInput, "source">): Promise<ErrorNotebookEntry[]> {
    const uniqueKey = `manual:${input.studyId ?? "unlinked"}:${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    return ErrorNotebookStorage.recordEntries([
      {
        ...input,
        source: "manual",
        dedupeKey: input.dedupeKey ?? uniqueKey,
      },
    ]);
  },

  async markStatus(entryId: string, status: ErrorReviewStatus): Promise<ErrorNotebookEntry[]> {
    const operation = SessionOperationManager.start();
    try {
      const nowIso = new Date().toISOString();
      const record = await StorageManager.updateMetadata<ErrorNotebookRecord>(
        NOTEBOOK_KEY,
        (current) => {
          operation.assertCurrent();
          const entries = sanitizeErrorNotebookList(current?.value);
          const updated = entries.map((entry) => {
            if (entry.id !== entryId) return entry;
            const incrementReview = status !== "pending" ? 1 : 0;
            return {
              ...entry,
              status,
              reviewCount: entry.reviewCount + incrementReview,
              lastReviewedAt: status !== "pending" ? nowIso : entry.lastReviewedAt,
            };
          });
          return {
            key: NOTEBOOK_KEY,
            value: updated,
            updatedAt: nowIso,
          };
        },
      );
      operation.assertCurrent();
      notifyUpdated();
      return record.value;
    } finally {
      operation.release();
    }
  },

  async markStudyPendingReviewed(
    studyId: string,
    targetStatus: Exclude<ErrorReviewStatus, "pending">,
  ): Promise<ErrorNotebookEntry[]> {
    const operation = SessionOperationManager.start();
    try {
      const nowIso = new Date().toISOString();
      const record = await StorageManager.updateMetadata<ErrorNotebookRecord>(
        NOTEBOOK_KEY,
        (current) => {
          operation.assertCurrent();
          const entries = sanitizeErrorNotebookList(current?.value);
          const updated = entries.map((entry) => {
            if (entry.studyId !== studyId || entry.status !== "pending") return entry;
            return {
              ...entry,
              status: targetStatus,
              reviewCount: entry.reviewCount + 1,
              lastReviewedAt: nowIso,
            };
          });
          return {
            key: NOTEBOOK_KEY,
            value: updated,
            updatedAt: nowIso,
          };
        },
      );
      operation.assertCurrent();
      notifyUpdated();
      return record.value;
    } finally {
      operation.release();
    }
  },

  async removeEntry(entryId: string): Promise<ErrorNotebookEntry[]> {
    const operation = SessionOperationManager.start();
    try {
      const nowIso = new Date().toISOString();
      const record = await StorageManager.updateMetadata<ErrorNotebookRecord>(
        NOTEBOOK_KEY,
        (current) => {
          operation.assertCurrent();
          const entries = sanitizeErrorNotebookList(current?.value);
          return {
            key: NOTEBOOK_KEY,
            value: entries.filter((entry) => entry.id !== entryId),
            updatedAt: nowIso,
          };
        },
      );
      operation.assertCurrent();
      notifyUpdated();
      return record.value;
    } finally {
      operation.release();
    }
  },

  reconcileWithStudies(
    entries: readonly ErrorNotebookEntry[],
    studies: readonly StudyRecord[],
  ): ErrorNotebookEntry[] {
    const byId = new Map(studies.map((study) => [study.studyId, study]));
    return entries.map((entry) => {
      if (!entry.studyId) return entry;
      const study = byId.get(entry.studyId);
      if (!study) {
        return {
          ...entry,
          sourceUnavailable: true,
        };
      }
      return {
        ...entry,
        studyTitle: study.title,
        subject: study.subject,
        sourceUnavailable: undefined,
      };
    });
  },
};
