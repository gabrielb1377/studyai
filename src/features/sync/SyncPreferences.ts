const accountPreferencePrefixes = [
  "studyai:workspace",
  "studyai:ai-settings",
  "studyai:experience-settings",
  "studyai:exams",
];

const devicePreferencePrefixes = [
  "studyai-theme",
  "studyai:sidebar",
  "studyai:language",
  "studyai:platform-settings",
];

export function isSyncPreferenceKey(key: string) {
  return accountPreferencePrefixes.some((prefix) => key.startsWith(prefix));
}

export function isDevicePreferenceKey(key: string) {
  return devicePreferencePrefixes.some((prefix) => key.startsWith(prefix));
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
