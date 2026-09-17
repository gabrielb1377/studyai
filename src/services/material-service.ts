import type { Material, MaterialFileType } from "@/types/material";
import { StorageManager } from "@/lib/storage/StorageManager";
import { MaterialBinaryStorage } from "./material-binary-storage";

export const MATERIALS_UPDATED_EVENT = "studyai:materials-updated";

function isMaterialBase(value: unknown): value is Omit<Material, "relativePath"> & { relativePath?: string } {
  if (!value || typeof value !== "object") return false;
  const material = value as Partial<Material>;

  return (
    typeof material.id === "string" &&
    typeof material.fileId === "string" &&
    typeof material.name === "string" &&
    (material.relativePath === undefined || typeof material.relativePath === "string") &&
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
  async load(): Promise<Material[]> {
    const stored = await StorageManager.getAll<unknown>("documents");
    return stored.filter(isMaterialBase).map((material) => {
        const relativePath = material.relativePath || material.name;
        return {
          ...material,
          relativePath,
          identity: `${relativePath}:${material.size}:${material.lastModified}`,
        } satisfies Material;
      });
  },

  async save(materials: readonly Material[]) {
    await StorageManager.replaceAll("documents", materials);
    emitUpdate();
  },

  createFromFile(file: File, fileType: MaterialFileType, id: string): Material {
    const now = new Date().toISOString();
    const relativePath = (file.webkitRelativePath || file.name)
      .replace(/\\/g, "/")
      .replace(/^\/+/, "");

    return {
      id,
      fileId: id,
      identity: `${relativePath}:${file.size}:${file.lastModified}`,
      name: file.name,
      relativePath,
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

  async upsert(material: Material) {
    await StorageManager.put("documents", material);
    emitUpdate();
    return material;
  },

  async update(id: string, changes: Partial<Omit<Material, "id" | "fileId">>) {
    const current = await StorageManager.get<Material>("documents", id);
    if (!current) return null;

    const updated: Material = {
      ...current,
      ...changes,
      updatedAt: new Date().toISOString(),
    };
    await StorageManager.put("documents", updated);
    emitUpdate();
    return updated;
  },

  async remove(id: string) {
    const current = await StorageManager.get<Material>("documents", id);
    if (!current) return false;
    await MaterialBinaryStorage.remove(id);
    await StorageManager.delete("documents", id);
    emitUpdate();
    return true;
  },

  async findById(id: string) {
    return await StorageManager.get<Material>("documents", id) ?? null;
  },

  async hasIdentity(identity: string) {
    return (await this.load()).some((material) => material.identity === identity);
  },
};
