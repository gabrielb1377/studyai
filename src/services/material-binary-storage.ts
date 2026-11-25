import type { Material } from "@/types/material";
import { SessionOperationManager } from "@/features/account/SessionOperationManager";

const DIRECTORY_NAME = "studyai-materials";

type StorageWithDirectory = StorageManager & {
  getDirectory?: () => Promise<FileSystemDirectoryHandle>;
};

async function directory(create = false) {
  if (typeof navigator === "undefined") return null;
  const storage = navigator.storage as StorageWithDirectory;
  if (!storage.getDirectory) return null;
  try {
    const root = await storage.getDirectory();
    const base = await root.getDirectoryHandle(DIRECTORY_NAME, { create });
    const session = SessionOperationManager.current();
    if (session.suspended) return null;
    const scope = session.userId ? `user-${session.userId.replace(/[^a-zA-Z0-9_-]/g, "_")}` : "guest";
    return await base.getDirectoryHandle(scope, { create });
  } catch {
    return null;
  }
}

export const MaterialBinaryStorage = {
  async isSupported() {
    if (typeof navigator === "undefined") return false;
    return typeof (navigator.storage as StorageWithDirectory).getDirectory === "function";
  },

  async save(materialId: string, file: File) {
    const targetDirectory = await directory(true);
    if (!targetDirectory) return false;
    try {
      const handle = await targetDirectory.getFileHandle(materialId, { create: true });
      const writable = await handle.createWritable();
      await writable.write(file);
      await writable.close();
      return true;
    } catch {
      return false;
    }
  },

  async load(material: Pick<Material, "id" | "name" | "mimeType"> & { lastModified?: number; binaryStorageId?: string }) {
    const targetDirectory = await directory(false);
    if (!targetDirectory) return null;
    try {
      const handle = await targetDirectory.getFileHandle(material.binaryStorageId ?? material.id);
      const stored = await handle.getFile();
      return new File([stored], material.name, {
        type: material.mimeType || stored.type,
        lastModified: material.lastModified ?? stored.lastModified,
      });
    } catch {
      return null;
    }
  },

  async remove(materialId: string) {
    const targetDirectory = await directory(false);
    if (!targetDirectory) return;
    try {
      await targetDirectory.removeEntry(materialId);
    } catch {
      // O arquivo pode não ter sido persistido neste navegador.
    }
  },
};
