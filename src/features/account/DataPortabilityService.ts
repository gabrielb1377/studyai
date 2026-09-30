import { StorageManager } from "@/lib/storage/StorageManager";
import { STORAGE_SCHEMA_VERSION, STORAGE_STORES, type StorageStoreName } from "@/lib/storage/StorageVersion";

type PortableArchive = {
  product: "StudyAI";
  version: 1 | 2;
  schemaVersion: number;
  exportedAt: string;
  stores: Partial<Record<StorageStoreName, unknown[]>>;
  preferences?: Record<string, string>;
};

const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
const MAX_RECORDS = 200_000;
const MAX_PREFERENCE_BYTES = 2 * 1024 * 1024;
const preferencePrefixes = [
  "studyai:workspace",
  "studyai:ai-settings",
  "studyai:platform-settings",
  "studyai:experience-settings",
  "studyai-theme",
  "studyai:sidebar",
  "studyai:language",
  "studyai:library-view",
  "studyai:teacher-preferences",
];

function portablePreference(key: string) {
  return preferencePrefixes.some((prefix) => key.startsWith(prefix));
}

function collectPreferences() {
  if (typeof localStorage === "undefined") return {};
  const preferences: Record<string, string> = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key || !portablePreference(key)) continue;
    const value = localStorage.getItem(key);
    if (value !== null && new TextEncoder().encode(value).byteLength <= MAX_PREFERENCE_BYTES) preferences[key] = value;
  }
  return preferences;
}

function isArchive(value: unknown): value is PortableArchive {
  if (!value || typeof value !== "object") return false;
  const archive = value as Partial<PortableArchive>;
  if (archive.product !== "StudyAI" || (archive.version !== 1 && archive.version !== 2) || typeof archive.stores !== "object" || !archive.stores) return false;
  if (!Number.isInteger(archive.schemaVersion) || Number(archive.schemaVersion) > STORAGE_SCHEMA_VERSION) return false;
  let records = 0;
  for (const [store, values] of Object.entries(archive.stores)) {
    if (!STORAGE_STORES.includes(store as StorageStoreName) || !Array.isArray(values)) return false;
    records += values.length;
    if (records > MAX_RECORDS) return false;
  }
  if (archive.preferences && Object.entries(archive.preferences).some(([key, preference]) => !portablePreference(key) || typeof preference !== "string" || new TextEncoder().encode(preference).byteLength > MAX_PREFERENCE_BYTES)) return false;
  return true;
}

export const DataPortabilityService = {
  async exportArchive() {
    const stores = Object.fromEntries(await Promise.all(STORAGE_STORES.map(async (store) => [store, await StorageManager.getAll(store)]))) as PortableArchive["stores"];
    const archive: PortableArchive = { product: "StudyAI", version: 2, schemaVersion: STORAGE_SCHEMA_VERSION, exportedAt: new Date().toISOString(), stores, preferences: collectPreferences() };
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
    if (file.size > MAX_ARCHIVE_BYTES) throw new Error("O backup excede o limite de 50 MB para restauração local.");
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      throw new Error("Este arquivo não é um backup válido do StudyAI.");
    }
    if (!isArchive(parsed)) throw new Error("Este arquivo não é um backup válido do StudyAI.");
    await StorageManager.transaction(STORAGE_STORES, async (storage) => {
      for (const store of STORAGE_STORES) {
        for (const record of parsed.stores[store] ?? []) await storage.put(store, record);
      }
    });
    if (typeof localStorage !== "undefined") {
      for (const [key, value] of Object.entries(parsed.preferences ?? {})) localStorage.setItem(key, value);
      window.dispatchEvent(new Event("studyai:workspace-updated"));
    }
    return parsed;
  },
  async clearLocalData() {
    for (const store of STORAGE_STORES) await StorageManager.replaceAll(store, []);
  },
};
