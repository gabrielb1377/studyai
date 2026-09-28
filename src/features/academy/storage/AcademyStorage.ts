import { StorageManager } from "@/lib/storage/StorageManager";
import type { AcademyStudy } from "../types";

export const ACADEMY_UPDATED_EVENT = "studyai:academy-updated";

function isAcademyStudy(value: unknown): value is AcademyStudy {
  if (!value || typeof value !== "object") return false;
  const study = value as Partial<AcademyStudy>;
  return typeof study.id === "string" && typeof study.topic === "string" &&
    typeof study.subject === "string" && study.sourceType === "ai-generated" &&
    typeof study.duration === "number" && typeof study.progress === "number" &&
    Array.isArray(study.modules) && (study.contents === undefined || Array.isArray(study.contents)) && typeof study.createdAt === "string" &&
    typeof study.updatedAt === "string";
}

function emitUpdate() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ACADEMY_UPDATED_EVENT));
}

export const AcademyStorage = {
  async list() {
    const studies = await StorageManager.getAll<unknown>("academy");
    return studies.filter(isAcademyStudy).map((study) => ({ ...study, contents: study.contents ?? [] })).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  },

  async get(id: string) {
    const study = await StorageManager.get<unknown>("academy", id);
    return isAcademyStudy(study) ? { ...study, contents: study.contents ?? [] } : null;
  },

  async put(study: AcademyStudy) {
    await StorageManager.put("academy", study);
    emitUpdate();
    return study;
  },

  async remove(id: string) {
    await StorageManager.delete("academy", id);
    emitUpdate();
  },

  emitUpdate,
};
