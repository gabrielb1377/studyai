const preferencePrefixes = ["studyai:workspace", "studyai:ai-settings", "studyai:platform-settings", "studyai:experience-settings", "studyai-theme", "studyai:sidebar", "studyai:language", "studyai:exams"];

export function isSyncPreferenceKey(key: string) {
  return preferencePrefixes.some((prefix) => key.startsWith(prefix));
}

export function syncPreferences(storage: Storage) {
  return Object.fromEntries(Object.entries(storage).filter(([key]) => isSyncPreferenceKey(key)));
}

export function applySyncPreferences(storage: Storage, data: unknown) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return;
  for (const [key, value] of Object.entries(data)) {
    if (isSyncPreferenceKey(key) && typeof value === "string") storage.setItem(key, value);
  }
}
