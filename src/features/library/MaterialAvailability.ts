import type { StudyMaterial } from "@/types/study";
import { MaterialBinaryStorage } from "@/services/material-binary-storage";
import { MaterialRuntimeStore } from "@/services/material-runtime-store";

export type MaterialOfflineStatus =
  | "local-complete"
  | "text-only"
  | "remote-only"
  | "storage-unavailable";

export type MaterialAvailabilityResult = {
  status: MaterialOfflineStatus;
  binaryLocal: boolean;
  opfsSupported: boolean;
  hasLocalText: boolean;
  runtimeSource?: string;
  file: File | null;
};

/**
 * Checks whether a study material has a locally available binary (runtime or OPFS)
 * and/or extracted text stored in IndexedDB.
 */
export async function checkMaterialOfflineAvailability(
  material: StudyMaterial,
): Promise<MaterialAvailabilityResult> {
  const hasLocalText = Boolean(material.textContent?.trim());
  const runtimeEntry = MaterialRuntimeStore.get(material.id);
  if (runtimeEntry) {
    return {
      status: "local-complete",
      binaryLocal: true,
      opfsSupported: await MaterialBinaryStorage.isSupported(),
      hasLocalText,
      runtimeSource: runtimeEntry.source,
      file: runtimeEntry.file,
    };
  }

  if (material.source) {
    return {
      status: "local-complete",
      binaryLocal: true,
      opfsSupported: await MaterialBinaryStorage.isSupported(),
      hasLocalText,
      runtimeSource: material.source,
      file: null,
    };
  }

  const opfsSupported = await MaterialBinaryStorage.isSupported();
  if (!opfsSupported) {
    return {
      status: hasLocalText ? "text-only" : "storage-unavailable",
      binaryLocal: false,
      opfsSupported: false,
      hasLocalText,
      file: null,
    };
  }

  const localFile = await MaterialBinaryStorage.load(material);
  if (localFile) {
    return {
      status: "local-complete",
      binaryLocal: true,
      opfsSupported: true,
      hasLocalText,
      file: localFile,
    };
  }

  return {
    status: hasLocalText ? "text-only" : "remote-only",
    binaryLocal: false,
    opfsSupported: true,
    hasLocalText,
    file: null,
  };
}

export function describeMaterialAvailability(
  status: MaterialOfflineStatus,
  isOnline: boolean,
): string {
  switch (status) {
    case "local-complete":
      return "Disponível neste dispositivo";
    case "text-only":
      return isOnline
        ? "Texto extraído salvo localmente (arquivo original ausente neste dispositivo)"
        : "Somente texto extraído disponível offline neste dispositivo";
    case "storage-unavailable":
      return "Armazenamento de arquivos (OPFS) indisponível neste navegador";
    case "remote-only":
      return isOnline
        ? "Arquivo não salvo neste dispositivo (somente na nuvem)"
        : "Indisponível offline — arquivo somente na nuvem";
  }
}
