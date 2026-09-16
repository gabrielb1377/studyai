import { readLocalStorage, removeLocalStorage, writeLocalStorage } from "@/lib/local-storage";
import type { Material } from "@/types/material";
import type { StudyRecord, StudyStatus } from "@/types/study-engine";

const STORAGE_KEY = "studyai:study-engine:v2";
const LEGACY_STORAGE_KEY = "studyai:study-engine";
export const STUDY_UPDATED_EVENT = "studyai:study-updated";

function isStudyRecordList(value: unknown): value is StudyRecord[] {
  return Array.isArray(value) && value.every((record) =>
    typeof record === "object" && record !== null &&
    typeof record.studyId === "string" && typeof record.title === "string" &&
    typeof record.subject === "string" && Array.isArray(record.materialIds) &&
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

function isOrganized(material: Material): material is Material & Required<Pick<Material, "studyId" | "subject" | "topic">> {
  return Boolean(material.studyId && material.subject && material.topic);
}

export const StudyEngine = {
  load(): StudyRecord[] {
    removeLocalStorage(LEGACY_STORAGE_KEY);
    return readLocalStorage(STORAGE_KEY, isStudyRecordList) ?? [];
  },

  save(records: readonly StudyRecord[]) {
    writeLocalStorage(STORAGE_KEY, records, STUDY_UPDATED_EVENT);
  },

  syncMaterial(records: readonly StudyRecord[], material: Material, now = new Date().toISOString()) {
    if (!isOrganized(material)) return [...records];

    const current = records.find((record) => record.studyId === material.studyId);
    if (!current) {
      return [
        ...records,
        {
          studyId: material.studyId,
          title: material.topic,
          subject: material.subject,
          course: material.course,
          semester: material.semester,
          materialIds: [material.id],
          status: "not_started" as const,
          progress: 0,
          createdAt: now,
          updatedAt: now,
          lastAccessedAt: now,
        },
      ];
    }

    return records.map((record) => record.studyId === material.studyId
      ? {
          ...record,
          title: material.topic,
          subject: material.subject,
          course: material.course,
          semester: material.semester,
          materialIds: Array.from(new Set([...record.materialIds, material.id])),
          updatedAt: now,
        }
      : record,
    );
  },

  removeMaterial(records: readonly StudyRecord[], studyId: string | undefined, materialId: string, now = new Date().toISOString()) {
    if (!studyId) return [...records];

    return records.flatMap((record) => {
      if (record.studyId !== studyId) return [record];
      const materialIds = record.materialIds.filter((id) => id !== materialId);
      return materialIds.length > 0 ? [{ ...record, materialIds, updatedAt: now }] : [];
    });
  },

  recordAccess(records: readonly StudyRecord[], studyId: string, now = new Date().toISOString()) {
    return records.map((record) => record.studyId === studyId
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

  enrichDocument(
    records: readonly StudyRecord[],
    studyId: string,
    analysis: Pick<StudyRecord, "initialSummary" | "detectedTitle" | "detectedSubject" | "detectedTopic" | "keywords" | "language">,
    now = new Date().toISOString(),
  ) {
    return records.map((record) => record.studyId === studyId
      ? {
          ...record,
          ...Object.fromEntries(Object.entries(analysis).filter(([, value]) => value !== undefined)),
          updatedAt: now,
        }
      : record,
    );
  },
};
