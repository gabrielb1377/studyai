import { StorageManager } from "@/lib/storage/StorageManager";
import { STORAGE_SCHEMA_VERSION, STORAGE_STORES, type StorageStoreName } from "@/lib/storage/StorageVersion";

type PortableArchive = {
  product: "StudyAI";
  version: 1;
  schemaVersion: number;
  exportedAt: string;
  stores: Partial<Record<StorageStoreName, unknown[]>>;
};

function isArchive(value: unknown): value is PortableArchive {
  return Boolean(value && typeof value === "object" && (value as Partial<PortableArchive>).product === "StudyAI" && (value as Partial<PortableArchive>).version === 1 && typeof (value as Partial<PortableArchive>).stores === "object");
}

export const DataPortabilityService = {
  async exportArchive() {
    const stores = Object.fromEntries(await Promise.all(STORAGE_STORES.map(async (store) => [store, await StorageManager.getAll(store)]))) as PortableArchive["stores"];
    const archive: PortableArchive = { product: "StudyAI", version: 1, schemaVersion: STORAGE_SCHEMA_VERSION, exportedAt: new Date().toISOString(), stores };
    return new Blob([JSON.stringify(archive, null, 2)], { type: "application/json" });
  },
  download(blob: Blob, prefix = "studyai-backup") {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${prefix}-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  },
  async importArchive(file: File) {
    const parsed: unknown = JSON.parse(await file.text());
    if (!isArchive(parsed)) throw new Error("Este arquivo não é um backup válido do StudyAI.");
    for (const store of STORAGE_STORES) {
      const records = parsed.stores[store];
      if (Array.isArray(records) && records.length > 0) await StorageManager.putMany(store, records);
    }
    return parsed;
  },
  async clearLocalData() {
    for (const store of STORAGE_STORES) await StorageManager.replaceAll(store, []);
  },
};
