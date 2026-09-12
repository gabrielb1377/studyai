import type { Material, MaterialFileType } from "@/types/material";

const STORAGE_KEY = "studyai:materials";
const STORAGE_VERSION = 1;
export const MATERIALS_UPDATED_EVENT = "studyai:materials-updated";

type MaterialStore = {
  version: typeof STORAGE_VERSION;
  materials: Material[];
};

function isMaterial(value: unknown): value is Material {
  if (!value || typeof value !== "object") return false;
  const material = value as Partial<Material>;

  return (
    typeof material.id === "string" &&
    typeof material.fileId === "string" &&
    typeof material.name === "string" &&
    typeof material.fileType === "string" &&
    typeof material.size === "number" &&
    typeof material.importedAt === "string" &&
    typeof material.status === "string"
  );
}

function emitUpdate() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(MATERIALS_UPDATED_EVENT));
  }
}

export const MaterialService = {
  load(): Material[] {
    if (typeof window === "undefined") return [];

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];

      const store = JSON.parse(raw) as Partial<MaterialStore>;
      if (store.version !== STORAGE_VERSION || !Array.isArray(store.materials)) return [];
      return store.materials.filter(isMaterial);
    } catch {
      return [];
    }
  },

  save(materials: Material[]) {
    if (typeof window === "undefined") return;
    const store: MaterialStore = { version: STORAGE_VERSION, materials };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    emitUpdate();
  },

  createFromFile(file: File, fileType: MaterialFileType, id: string): Material {
    const now = new Date().toISOString();

    return {
      id,
      fileId: id,
      identity: `${file.name}:${file.size}:${file.lastModified}`,
      name: file.name,
      fileType,
      mimeType: file.type,
      size: file.size,
      lastModified: file.lastModified,
      importedAt: now,
      updatedAt: now,
      progress: 0,
      status: "processing",
      isFavorite: false,
    };
  },

  upsert(material: Material) {
    const materials = this.load();
    const index = materials.findIndex((item) => item.id === material.id);

    if (index >= 0) materials[index] = material;
    else materials.unshift(material);

    this.save(materials);
    return material;
  },

  update(id: string, changes: Partial<Omit<Material, "id" | "fileId">>) {
    const materials = this.load();
    const index = materials.findIndex((material) => material.id === id);
    if (index < 0) return null;

    const updated: Material = {
      ...materials[index],
      ...changes,
      updatedAt: new Date().toISOString(),
    };
    materials[index] = updated;
    this.save(materials);
    return updated;
  },

  remove(id: string) {
    const materials = this.load();
    const next = materials.filter((material) => material.id !== id);
    if (next.length === materials.length) return false;
    this.save(next);
    return true;
  },

  findById(id: string) {
    return this.load().find((material) => material.id === id) ?? null;
  },

  hasIdentity(identity: string) {
    return this.load().some((material) => material.identity === identity);
  },
};
