import { StorageManager, STORAGE_UPDATED_EVENT } from "@/lib/storage/StorageManager";
import { isLabProject } from "../validators/lab-validation";
import type { LabProject } from "../types";

export const LAB_UPDATED_EVENT = "studyai:lab-updated";

function emit() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(LAB_UPDATED_EVENT));
}

export const LabStorage = {
  async list() {
    const records = await StorageManager.getAll<unknown>("lab");
    return records.filter(isLabProject).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  async get(id: string) {
    const value = await StorageManager.get<unknown>("lab", id);
    return isLabProject(value) ? value : undefined;
  },
  async put(project: LabProject) {
    await StorageManager.put("lab", project);
    emit();
    return project;
  },
  async remove(id: string) {
    await StorageManager.delete("lab", id);
    emit();
  },
  subscribe(listener: () => void) {
    if (typeof window === "undefined") return () => undefined;
    const storageListener = (event: Event) => {
      const detail = (event as CustomEvent<{ store?: string }>).detail;
      if (!detail?.store || detail.store === "lab") listener();
    };
    window.addEventListener(LAB_UPDATED_EVENT, listener);
    window.addEventListener(STORAGE_UPDATED_EVENT, storageListener);
    return () => {
      window.removeEventListener(LAB_UPDATED_EVENT, listener);
      window.removeEventListener(STORAGE_UPDATED_EVENT, storageListener);
    };
  },
};
