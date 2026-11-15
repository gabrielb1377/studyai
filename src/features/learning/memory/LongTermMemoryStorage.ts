import { SessionOperationManager } from "@/features/account/SessionOperationManager";
import { StorageManager } from "@/lib/storage/StorageManager";
import type { StudyRecord } from "@/types/study-engine";
import {
  MAX_MEMORY_CONTENT,
  MAX_MEMORY_ENTRIES,
  MAX_MEMORY_TITLE,
  buildMemoryEntry,
  isValidExplanationLevel,
  sanitizeMemoryStoreState,
  sanitizeMemoryText,
} from "./MemoryValidation";
import type {
  CreateMemoryInput,
  ExplanationLevel,
  LongTermMemoryEntry,
  LongTermMemoryStoreState,
} from "./types";

const MEMORY_KEY = "long-term-memory-v1";
export const LONG_TERM_MEMORY_UPDATED_EVENT = "studyai:long-term-memory-updated";

type MemoryMetadataRecord = {
  key: typeof MEMORY_KEY;
  value: LongTermMemoryStoreState;
  updatedAt: string;
};

function notifyUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(LONG_TERM_MEMORY_UPDATED_EVENT));
  }
}

export function upsertMemoryList(
  existing: readonly LongTermMemoryEntry[],
  input: CreateMemoryInput,
  nowIso = new Date().toISOString(),
): LongTermMemoryEntry[] {
  const built = buildMemoryEntry(input, nowIso);
  if (!built) return [...existing];

  const matchIndex = built.dedupeKey
    ? existing.findIndex((entry) => entry.dedupeKey === built.dedupeKey)
    : -1;

  if (matchIndex === -1) {
    return [built, ...existing]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, MAX_MEMORY_ENTRIES);
  }

  const current = existing[matchIndex];
  const updated: LongTermMemoryEntry = {
    ...current,
    category: built.category,
    studyId: built.studyId ?? current.studyId,
    studyTitle: built.studyTitle ?? current.studyTitle,
    subject: built.subject ?? current.subject,
    title: built.title,
    content: built.content,
    updatedAt: nowIso,
    expiresAt: built.expiresAt,
  };

  return existing
    .map((entry, idx) => (idx === matchIndex ? updated : entry))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, MAX_MEMORY_ENTRIES);
}

async function mutateMemoryStore(
  mutator: (current: LongTermMemoryStoreState, nowIso: string) => LongTermMemoryStoreState,
): Promise<LongTermMemoryStoreState> {
  const operation = SessionOperationManager.start();
  try {
    const nowIso = new Date().toISOString();
    const record = await StorageManager.updateMetadata<MemoryMetadataRecord>(
      MEMORY_KEY,
      (current) => {
        operation.assertCurrent();
        const sanitized = sanitizeMemoryStoreState(current?.value);
        const next = mutator(sanitized, nowIso);
        return {
          key: MEMORY_KEY,
          value: sanitizeMemoryStoreState(next),
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
}

export const LongTermMemoryStorage = {
  async load(): Promise<LongTermMemoryStoreState> {
    const session = SessionOperationManager.current();
    if (session.suspended) {
      return { settings: { enabled: true }, entries: [] };
    }
    const record = await StorageManager.get<MemoryMetadataRecord>("metadata", MEMORY_KEY);
    return sanitizeMemoryStoreState(record?.value);
  },

  async setEnabled(enabled: boolean): Promise<LongTermMemoryStoreState> {
    return mutateMemoryStore((current) => ({
      ...current,
      settings: {
        ...current.settings,
        enabled,
      },
    }));
  },

  async setExplanationLevel(level: ExplanationLevel | undefined): Promise<LongTermMemoryStoreState> {
    const validated = level && isValidExplanationLevel(level) ? level : undefined;
    return mutateMemoryStore((current) => ({
      ...current,
      settings: {
        ...current.settings,
        explanationLevel: validated,
      },
    }));
  },

  async addMemory(input: CreateMemoryInput): Promise<LongTermMemoryStoreState> {
    return mutateMemoryStore((current, nowIso) => ({
      ...current,
      entries: upsertMemoryList(current.entries, input, nowIso),
    }));
  },

  async recordSessionContinuity(input: {
    studyId?: string;
    studyTitle?: string;
    subject?: string;
    question: string;
  }): Promise<LongTermMemoryStoreState> {
    const summary = sanitizeMemoryText(input.question, MAX_MEMORY_CONTENT);
    if (!summary) return LongTermMemoryStorage.load();

    const dedupeKey = input.studyId
      ? `continuity:${input.studyId}`
      : `continuity:${sanitizeMemoryText(input.subject, 48, "geral").toLowerCase()}`;
    const title = input.studyTitle
      ? `Continuidade · ${sanitizeMemoryText(input.studyTitle, MAX_MEMORY_TITLE - 15)}`
      : "Último foco de estudo";

    return mutateMemoryStore((current, nowIso) => {
      if (!current.settings.enabled) return current;
      const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
      return {
        ...current,
        entries: upsertMemoryList(
          current.entries,
          {
            dedupeKey,
            category: "continuity",
            source: "session",
            studyId: input.studyId,
            studyTitle: input.studyTitle,
            subject: input.subject,
            title,
            content: `Última dúvida/tema trabalhado: ${summary}`,
            expiresAt,
          },
          nowIso,
        ),
      };
    });
  },

  async updateMemory(
    entryId: string,
    patch: { title?: string; content?: string },
  ): Promise<LongTermMemoryStoreState> {
    return mutateMemoryStore((current, nowIso) => ({
      ...current,
      entries: current.entries.map((entry) => {
        if (entry.id !== entryId) return entry;
        const nextTitle = patch.title !== undefined
          ? sanitizeMemoryText(patch.title, MAX_MEMORY_TITLE) || entry.title
          : entry.title;
        const nextContent = patch.content !== undefined
          ? sanitizeMemoryText(patch.content, MAX_MEMORY_CONTENT) || entry.content
          : entry.content;
        return {
          ...entry,
          title: nextTitle,
          content: nextContent,
          updatedAt: nowIso,
        };
      }),
    }));
  },

  async removeMemory(entryId: string): Promise<LongTermMemoryStoreState> {
    return mutateMemoryStore((current) => ({
      ...current,
      entries: current.entries.filter((entry) => entry.id !== entryId),
    }));
  },

  async clearAll(): Promise<LongTermMemoryStoreState> {
    return mutateMemoryStore((current) => ({
      ...current,
      entries: [],
    }));
  },

  reconcileWithStudies(
    entries: readonly LongTermMemoryEntry[],
    studies: readonly StudyRecord[],
  ): LongTermMemoryEntry[] {
    const byId = new Map(studies.map((study) => [study.studyId, study]));
    return entries.map((entry) => {
      if (!entry.studyId) return entry;
      const linked = byId.get(entry.studyId);
      if (!linked) {
        return {
          ...entry,
          sourceUnavailable: true,
        };
      }
      return {
        ...entry,
        studyTitle: linked.title,
        subject: linked.subject,
        sourceUnavailable: undefined,
      };
    });
  },
};
