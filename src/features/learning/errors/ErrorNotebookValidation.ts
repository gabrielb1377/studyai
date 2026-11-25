import type {
  CreateErrorEntryInput,
  ErrorNotebookEntry,
  ErrorReviewStatus,
  ErrorSource,
} from "./types";

export const MAX_ERROR_ENTRIES = 300;
export const MAX_PROMPT_LENGTH = 500;
export const MAX_ANSWER_LENGTH = 300;
export const MAX_EXPLANATION_LENGTH = 500;
export const MAX_LABEL_LENGTH = 140;

const VALID_SOURCES: readonly ErrorSource[] = ["quiz", "flashcard", "exam_material", "manual"];
const VALID_STATUSES: readonly ErrorReviewStatus[] = ["pending", "reviewed", "resolved"];

export function isErrorSource(value: unknown): value is ErrorSource {
  return typeof value === "string" && (VALID_SOURCES as readonly string[]).includes(value);
}

export function isErrorReviewStatus(value: unknown): value is ErrorReviewStatus {
  return typeof value === "string" && (VALID_STATUSES as readonly string[]).includes(value);
}

export function sanitizeErrorText(value: unknown, maxLength: number, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function sanitizeIsoDate(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
}

export function buildDedupeKey(input: CreateErrorEntryInput): string {
  const explicit = sanitizeErrorText(input.dedupeKey, 200);
  if (explicit) return explicit;
  const studyPart = sanitizeErrorText(input.studyId, 100) || "unlinked";
  const sourcePart = sanitizeErrorText(input.sourceId, 120);
  if (sourcePart) return `${input.source}:${studyPart}:${sourcePart}`;
  const promptHash = sanitizeErrorText(input.questionPrompt, 120).toLowerCase();
  return `${input.source}:${studyPart}:${promptHash}`;
}

export function normalizeCreateErrorInput(
  input: CreateErrorEntryInput,
  nowIso = new Date().toISOString(),
): ErrorNotebookEntry | null {
  if (!isErrorSource(input.source)) return null;
  const questionPrompt = sanitizeErrorText(input.questionPrompt, MAX_PROMPT_LENGTH);
  const wrongAnswer = sanitizeErrorText(input.wrongAnswer, MAX_ANSWER_LENGTH);
  if (!questionPrompt || !wrongAnswer) return null;

  const studyId = sanitizeErrorText(input.studyId, 120) || undefined;
  const studyTitle = sanitizeErrorText(input.studyTitle, MAX_LABEL_LENGTH, "Estudo") || "Estudo";
  const subject = sanitizeErrorText(input.subject, 80, "Geral") || "Geral";
  const topic = sanitizeErrorText(input.topic, MAX_LABEL_LENGTH, studyTitle) || studyTitle;
  const occurredAt = sanitizeIsoDate(input.occurredAt, nowIso);
  const dedupeKey = buildDedupeKey(input);

  return {
    id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    dedupeKey,
    studyId,
    studyTitle,
    subject,
    topic,
    source: input.source,
    sourceId: sanitizeErrorText(input.sourceId, 120) || undefined,
    questionPrompt,
    wrongAnswer,
    correctAnswer: sanitizeErrorText(input.correctAnswer, MAX_ANSWER_LENGTH) || undefined,
    explanation: sanitizeErrorText(input.explanation, MAX_EXPLANATION_LENGTH) || undefined,
    occurrences: 1,
    status: "pending",
    reviewCount: 0,
    createdAt: occurredAt,
    lastOccurredAt: occurredAt,
  };
}

export function sanitizeErrorNotebookEntry(raw: unknown): ErrorNotebookEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const item = raw as Partial<ErrorNotebookEntry>;
  if (typeof item.id !== "string" || !item.id.trim()) return null;
  if (!isErrorSource(item.source)) return null;

  const questionPrompt = sanitizeErrorText(item.questionPrompt, MAX_PROMPT_LENGTH);
  const wrongAnswer = sanitizeErrorText(item.wrongAnswer, MAX_ANSWER_LENGTH);
  if (!questionPrompt || !wrongAnswer) return null;

  const fallbackIso = new Date().toISOString();
  const createdAt = sanitizeIsoDate(item.createdAt, fallbackIso);
  const lastOccurredAt = sanitizeIsoDate(item.lastOccurredAt, createdAt);
  const studyId = sanitizeErrorText(item.studyId, 120) || undefined;
  const studyTitle = sanitizeErrorText(item.studyTitle, MAX_LABEL_LENGTH, "Estudo") || "Estudo";
  const dedupeKey =
    sanitizeErrorText(item.dedupeKey, 200) ||
    `${item.source}:${studyId ?? "unlinked"}:${sanitizeErrorText(item.sourceId, 120) || questionPrompt.slice(0, 80).toLowerCase()}`;

  const occurrences =
    typeof item.occurrences === "number" && Number.isFinite(item.occurrences)
      ? Math.max(1, Math.min(999, Math.round(item.occurrences)))
      : 1;
  const reviewCount =
    typeof item.reviewCount === "number" && Number.isFinite(item.reviewCount)
      ? Math.max(0, Math.min(999, Math.round(item.reviewCount)))
      : 0;

  return {
    id: item.id.slice(0, 120),
    dedupeKey,
    studyId,
    studyTitle,
    subject: sanitizeErrorText(item.subject, 80, "Geral") || "Geral",
    topic: sanitizeErrorText(item.topic, MAX_LABEL_LENGTH, studyTitle) || studyTitle,
    source: item.source,
    sourceId: sanitizeErrorText(item.sourceId, 120) || undefined,
    questionPrompt,
    wrongAnswer,
    correctAnswer: sanitizeErrorText(item.correctAnswer, MAX_ANSWER_LENGTH) || undefined,
    explanation: sanitizeErrorText(item.explanation, MAX_EXPLANATION_LENGTH) || undefined,
    occurrences,
    status: isErrorReviewStatus(item.status) ? item.status : "pending",
    reviewCount,
    createdAt,
    lastOccurredAt,
    lastReviewedAt: item.lastReviewedAt ? sanitizeIsoDate(item.lastReviewedAt, lastOccurredAt) : undefined,
    sourceUnavailable: Boolean(item.sourceUnavailable) || undefined,
  };
}

export function sanitizeErrorNotebookList(raw: unknown): ErrorNotebookEntry[] {
  if (!Array.isArray(raw)) return [];
  const byDedupe = new Map<string, ErrorNotebookEntry>();
  for (const item of raw) {
    const clean = sanitizeErrorNotebookEntry(item);
    if (!clean) continue;
    const existing = byDedupe.get(clean.dedupeKey);
    if (!existing) {
      byDedupe.set(clean.dedupeKey, clean);
    } else if (clean.lastOccurredAt > existing.lastOccurredAt) {
      byDedupe.set(clean.dedupeKey, {
        ...clean,
        occurrences: Math.max(clean.occurrences, existing.occurrences),
      });
    }
    if (byDedupe.size >= MAX_ERROR_ENTRIES) break;
  }
  return [...byDedupe.values()].sort((left, right) => right.lastOccurredAt.localeCompare(left.lastOccurredAt));
}
