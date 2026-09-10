export function readLocalStorage<T>(
  key: string,
  isValid: (value: unknown) => value is T,
): T | null {
  if (typeof window === "undefined") return null;

  try {
    const rawValue = window.localStorage.getItem(key);
    if (!rawValue) return null;

    const value: unknown = JSON.parse(rawValue);
    return isValid(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeLocalStorage<T>(
  key: string,
  value: T,
  updateEvent?: string,
) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(key, JSON.stringify(value));
  if (updateEvent) window.dispatchEvent(new Event(updateEvent));
}

export function removeLocalStorage(key: string, updateEvent?: string) {
  if (typeof window === "undefined") return;

  window.localStorage.removeItem(key);
  if (updateEvent) window.dispatchEvent(new Event(updateEvent));
}
