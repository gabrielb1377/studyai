import type { Topic } from "@/types/study";
import type { StudyRecord, StudyStatus } from "@/types/study-engine";
import { readLocalStorage, writeLocalStorage } from "@/lib/local-storage";

const STORAGE_KEY = "studyai:study-engine";
const UPDATE_EVENT = "studyai:study-updated";
const SEED_DATE = "2026-01-01T00:00:00.000Z";

function isStudyRecordList(value: unknown): value is StudyRecord[] {
  return Array.isArray(value) && value.every((record) =>
    typeof record === "object" && record !== null &&
    typeof record.studyId === "string" && typeof record.title === "string" &&
    typeof record.subject === "string" &&
    (record.status === "not_started" || record.status === "in_progress" || record.status === "completed") &&
    typeof record.progress === "number" && typeof record.createdAt === "string" &&
    typeof record.updatedAt === "string" && typeof record.lastAccessedAt === "string",
  );
}

function clampProgress(progress: number) {
  return Math.min(100, Math.max(0, Math.round(progress)));
}

function statusFromProgress(progress: number): StudyStatus {
  if (progress === 0) return "not_started";
  if (progress === 100) return "completed";
  return "in_progress";
}

export const StudyEngine = {
  load(): StudyRecord[] {
    return readLocalStorage(STORAGE_KEY, isStudyRecordList) ?? [];
  },

  save(records: readonly StudyRecord[]) {
    writeLocalStorage(STORAGE_KEY, records, UPDATE_EVENT);
  },

  create(topic: Pick<Topic, "id" | "title" | "subject" | "progress">, now = new Date().toISOString()): StudyRecord {
    const progress = clampProgress(topic.progress);
    return {
      studyId: topic.id,
      title: topic.title,
      subject: topic.subject,
      status: statusFromProgress(progress),
      progress,
      createdAt: now,
      updatedAt: now,
      lastAccessedAt: now,
    };
  },

  ensureTopics(records: readonly StudyRecord[], topics: readonly Topic[]) {
    const knownIds = new Set(records.map((record) => record.studyId));
    return [...records, ...topics.filter((topic) => !knownIds.has(topic.id)).map((topic) => this.create(topic, SEED_DATE))];
  },

  recordAccess(records: readonly StudyRecord[], topic: Topic, now = new Date().toISOString()) {
    const existing = records.find((record) => record.studyId === topic.id);
    if (!existing) return [...records, this.create(topic, now)];

    return records.map((record) => record.studyId === topic.id
      ? { ...record, lastAccessedAt: now, updatedAt: now }
      : record,
    );
  },

  setProgress(records: readonly StudyRecord[], studyId: string, progress: number, now = new Date().toISOString()) {
    const nextProgress = clampProgress(progress);
    return records.map((record) => record.studyId === studyId
      ? { ...record, progress: nextProgress, status: statusFromProgress(nextProgress), updatedAt: now }
      : record,
    );
  },

  setStatus(records: readonly StudyRecord[], studyId: string, status: StudyStatus, now = new Date().toISOString()) {
    return records.map((record) => {
      if (record.studyId !== studyId) return record;
      const progress = status === "not_started" ? 0 : status === "completed" ? 100 : Math.max(1, record.progress);
      return { ...record, status, progress, updatedAt: now };
    });
  },
};
