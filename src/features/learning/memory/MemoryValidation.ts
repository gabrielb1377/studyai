import type {
  CreateMemoryInput,
  ExplanationLevel,
  LongTermMemoryEntry,
  LongTermMemorySettings,
  LongTermMemoryStoreState,
  MemoryCategory,
  MemorySource,
} from "./types";

export const MAX_MEMORY_ENTRIES = 120;
export const MAX_MEMORY_TITLE = 100;
export const MAX_MEMORY_CONTENT = 280;
export const MAX_MEMORY_META = 100;
export const MEMORY_STALE_DAYS = 45;

const VALID_CATEGORIES = new Set<MemoryCategory>([
  "preference",
  "goal",
  "difficulty",
  "continuity",
  "milestone",
]);

const VALID_SOURCES = new Set<MemorySource>(["explicit", "session"]);

const VALID_LEVELS = new Set<ExplanationLevel>([
  "basic",
  "intermediate",
  "advanced",
  "technical",
]);

export function sanitizeMemoryText(
  value: unknown,
  maxLength: number,
  fallback = "",
): string {
  if (typeof value !== "string") return fallback;
  const cleaned = value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return fallback;
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength).trim() : cleaned;
}

export function isValidMemoryId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9:_-]{3,120}$/.test(value);
}

export function isValidExplanationLevel(value: unknown): value is ExplanationLevel {
  return typeof value === "string" && VALID_LEVELS.has(value as ExplanationLevel);
}

export function isMemoryExpired(entry: Pick<LongTermMemoryEntry, "expiresAt">, now = new Date()): boolean {
  if (!entry.expiresAt) return false;
  const parsed = Date.parse(entry.expiresAt);
  if (Number.isNaN(parsed)) return false;
  return parsed <= now.getTime();
}

export function isMemoryStale(
  entry: Pick<LongTermMemoryEntry, "updatedAt">,
  now = new Date(),
  staleDays = MEMORY_STALE_DAYS,
): boolean {
  const parsed = Date.parse(entry.updatedAt);
  if (Number.isNaN(parsed)) return false;
  return now.getTime() - parsed >= staleDays * 86_400_000;
}

export function sanitizeMemorySettings(raw: unknown): LongTermMemorySettings {
  if (typeof raw !== "object" || raw === null) {
    return { enabled: true };
  }
  const candidate = raw as Partial<LongTermMemorySettings>;
  return {
    enabled: typeof candidate.enabled === "boolean" ? candidate.enabled : true,
    explanationLevel: isValidExplanationLevel(candidate.explanationLevel)
      ? candidate.explanationLevel
      : undefined,
  };
}

export function sanitizeMemoryEntry(raw: unknown): LongTermMemoryEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const item = raw as Partial<LongTermMemoryEntry>;
  if (!isValidMemoryId(item.id)) return null;
  if (!item.category || !VALID_CATEGORIES.has(item.category)) return null;
  if (!item.source || !VALID_SOURCES.has(item.source)) return null;

  const title = sanitizeMemoryText(item.title, MAX_MEMORY_TITLE);
  const content = sanitizeMemoryText(item.content, MAX_MEMORY_CONTENT);
  if (!title || !content) return null;

  const nowIso = new Date().toISOString();
  const createdAt = typeof item.createdAt === "string" && !Number.isNaN(Date.parse(item.createdAt))
    ? item.createdAt
    : nowIso;
  const updatedAt = typeof item.updatedAt === "string" && !Number.isNaN(Date.parse(item.updatedAt))
    ? item.updatedAt
    : createdAt;

  return {
    id: item.id,
    dedupeKey: typeof item.dedupeKey === "string"
      ? sanitizeMemoryText(item.dedupeKey, 160) || undefined
      : undefined,
    category: item.category,
    source: item.source,
    studyId: isValidMemoryId(item.studyId) ? item.studyId : undefined,
    studyTitle: sanitizeMemoryText(item.studyTitle, MAX_MEMORY_META) || undefined,
    subject: sanitizeMemoryText(item.subject, MAX_MEMORY_META) || undefined,
    title,
    content,
    createdAt,
    updatedAt,
    expiresAt: typeof item.expiresAt === "string" && !Number.isNaN(Date.parse(item.expiresAt))
      ? item.expiresAt
      : undefined,
  };
}

export function sanitizeMemoryStoreState(raw: unknown): LongTermMemoryStoreState {
  if (typeof raw !== "object" || raw === null) {
    return { settings: { enabled: true }, entries: [] };
  }
  const state = raw as Partial<LongTermMemoryStoreState>;
  const entries = Array.isArray(state.entries)
    ? state.entries
        .map(sanitizeMemoryEntry)
        .filter((entry): entry is LongTermMemoryEntry => entry !== null)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, MAX_MEMORY_ENTRIES)
    : [];

  return {
    settings: sanitizeMemorySettings(state.settings),
    entries,
  };
}

export function buildMemoryEntry(
  input: CreateMemoryInput,
  nowIso = new Date().toISOString(),
): LongTermMemoryEntry | null {
  if (!VALID_CATEGORIES.has(input.category) || !VALID_SOURCES.has(input.source)) {
    return null;
  }
  const title = sanitizeMemoryText(input.title, MAX_MEMORY_TITLE);
  const content = sanitizeMemoryText(input.content, MAX_MEMORY_CONTENT);
  if (!title || !content) return null;

  const studyId = isValidMemoryId(input.studyId) ? input.studyId : undefined;
  const id = `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    dedupeKey: input.dedupeKey ? sanitizeMemoryText(input.dedupeKey, 160) || undefined : undefined,
    category: input.category,
    source: input.source,
    studyId,
    studyTitle: sanitizeMemoryText(input.studyTitle, MAX_MEMORY_META) || undefined,
    subject: sanitizeMemoryText(input.subject, MAX_MEMORY_META) || undefined,
    title,
    content,
    createdAt: nowIso,
    updatedAt: nowIso,
    expiresAt: input.expiresAt && !Number.isNaN(Date.parse(input.expiresAt))
      ? input.expiresAt
      : undefined,
  };
}
