"use client";

import { GlobalSearchService } from "@/features/search/GlobalSearchService";
import { ExperiencePreferencesService } from "@/features/preferences/ExperiencePreferences";
import { isSyncPreferenceKey } from "@/features/sync/SyncPreferences";
import { StorageManager } from "@/lib/storage/StorageManager";
import { currentDatabaseName } from "@/lib/storage/Database";
import { MaterialRuntimeStore } from "@/services/material-runtime-store";

const ACTIVE_OWNER_KEY = "studyai:active-session-owner";
const PRIVATE_DATA_KEY = "session-local-preferences:v1";
const RECOVERY_PREFIX = "session-local-recovery:v1:";
const extraPrivatePrefixes = [
  "studyai:teacher",
  "studyai:audio-lesson",
  "studyai:quality-lab",
  "studyai:studio-editor",
  "studyai:workspace-note:",
  "studyai:last-cloud-backup",
];

type LocalDataRecord = { key: string; value: Record<string, string>; updatedAt: string; owner?: string };

export function isPrivateSessionKey(key: string) {
  return isSyncPreferenceKey(key) || extraPrivatePrefixes.some((prefix) => key.startsWith(prefix));
}

function snapshot() {
  return Object.fromEntries(Object.keys(localStorage).filter(isPrivateSessionKey).map((key) => [key, localStorage.getItem(key) ?? ""]));
}

function clearActiveData() {
  for (const key of Object.keys(localStorage)) if (isPrivateSessionKey(key)) localStorage.removeItem(key);
  MaterialRuntimeStore.clear();
  GlobalSearchService.clearCache();
  ExperiencePreferencesService.invalidate();
}

export const SessionLocalData = {
  async suspend(ownerHint?: string) {
    const values = snapshot();
    const persistedOwner = localStorage.getItem(ACTIVE_OWNER_KEY) ?? undefined;
    const owner = persistedOwner ?? ownerHint;
    if (Object.keys(values).length > 0) {
      const expectedDatabase = owner ? `studyai-db:user-${owner}` : "studyai-db";
      if (currentDatabaseName() !== expectedDatabase) await StorageManager.setUserScope(owner);
      const key = owner ? PRIVATE_DATA_KEY : `${RECOVERY_PREFIX}${Date.now()}-${crypto.randomUUID()}`;
      await StorageManager.put("metadata", { key, value: values, updatedAt: new Date().toISOString(), owner }, { notify: false });
    }
    clearActiveData();
    localStorage.removeItem(ACTIVE_OWNER_KEY);
  },

  async resume(userId: string) {
    clearActiveData();
    const record = await StorageManager.get<LocalDataRecord>("metadata", PRIVATE_DATA_KEY);
    if (record?.owner === userId) {
      for (const [key, value] of Object.entries(record.value)) if (isPrivateSessionKey(key)) localStorage.setItem(key, value);
    }
    localStorage.setItem(ACTIVE_OWNER_KEY, userId);
    ExperiencePreferencesService.invalidate();
  },

  clearRuntime: clearActiveData,
};
