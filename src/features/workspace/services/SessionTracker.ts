import { SessionOperationManager } from "@/features/account/SessionOperationManager";
import { LearningService } from "@/features/learning/LearningService";
import { StorageManager } from "@/lib/storage/StorageManager";
import {
  workspacePanelTypes,
  type StudySessionOrigin,
  type StudySessionStatus,
  type WorkspacePanelType,
  type WorkspaceStudySession,
} from "../types";

export const WORKSPACE_SESSION_PREFIX = "workspace-session:";
export const SESSIONS_UPDATED_EVENT = "studyai:sessions-updated";
export const MIN_RECORDED_FOCUS_SECONDS = 5;

type SessionRecord = {
  key: string;
  value: WorkspaceStudySession;
  updatedAt: string;
};

const VALID_STATUSES: readonly StudySessionStatus[] = ["active", "paused", "completed", "cancelled"];
const finishInFlight = new Map<string, Promise<WorkspaceStudySession>>();

function emitSessionsUpdated(sessionId?: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SESSIONS_UPDATED_EVENT, { detail: { sessionId } }));
  }
}

function isValidIso(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

function clampNonNegInt(value: unknown, fallback = 0): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.floor(num));
}

function sanitizeTextField(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/\s+/g, " ").trim().slice(0, maxLength);
  return cleaned.length > 0 ? cleaned : undefined;
}

export function sanitizeStudySession(raw: unknown): WorkspaceStudySession | null {
  if (typeof raw !== "object" || raw === null) return null;
  const item = raw as Partial<WorkspaceStudySession>;
  if (typeof item.id !== "string" || !item.id.trim()) return null;
  if (typeof item.studyId !== "string" || !item.studyId.trim()) return null;
  if (!isValidIso(item.startedAt)) return null;
  if (!VALID_STATUSES.includes(item.status as StudySessionStatus)) return null;

  const status = item.status as StudySessionStatus;
  const startedMs = Date.parse(item.startedAt);
  const endedAt = isValidIso(item.endedAt) && Date.parse(item.endedAt) >= startedMs ? item.endedAt : undefined;
  const activePauseStartedAt =
    status === "paused" && isValidIso(item.activePauseStartedAt) && Date.parse(item.activePauseStartedAt) >= startedMs
      ? item.activePauseStartedAt
      : undefined;

  const pausedSeconds = clampNonNegInt(item.pausedSeconds, 0);
  const pausedMs =
    typeof item.pausedMs === "number" && Number.isFinite(item.pausedMs) && item.pausedMs >= 0
      ? Math.floor(item.pausedMs)
      : pausedSeconds * 1000;

  const origin: StudySessionOrigin = item.origin === "focus" ? "focus" : "workspace";
  const fileIds = Array.isArray(item.fileIds)
    ? Array.from(new Set(item.fileIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0))).slice(0, 64)
    : [];
  const tools = Array.isArray(item.tools)
    ? Array.from(
        new Set(
          item.tools.filter(
            (tool): tool is WorkspacePanelType =>
              typeof tool === "string" && (workspacePanelTypes as readonly string[]).includes(tool),
          ),
        ),
      )
    : [];

  const chapterSeconds: Record<string, number> = {};
  if (item.chapterSeconds && typeof item.chapterSeconds === "object") {
    for (const [chapter, seconds] of Object.entries(item.chapterSeconds)) {
      if (chapter.trim() && typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0) {
        chapterSeconds[chapter.slice(0, 140)] = Math.floor(seconds);
      }
    }
  }

  return {
    id: item.id.slice(0, 120),
    studyId: item.studyId.slice(0, 120),
    userId: sanitizeTextField(item.userId, 120),
    subject: sanitizeTextField(item.subject, 120),
    studyTitle: sanitizeTextField(item.studyTitle, 160),
    goalLabel: sanitizeTextField(item.goalLabel, 180),
    origin,
    focusMode: Boolean(item.focusMode),
    startedAt: item.startedAt,
    endedAt,
    status,
    durationSeconds: clampNonNegInt(item.durationSeconds, 0),
    focusSeconds: clampNonNegInt(item.focusSeconds, 0),
    pausedSeconds,
    pausedMs,
    pauseCount: clampNonNegInt(item.pauseCount, 0),
    activePauseStartedAt,
    manualPause: Boolean(item.manualPause),
    recordedAt: isValidIso(item.recordedAt) ? item.recordedAt : undefined,
    fileIds,
    tools,
    chapterSeconds,
    activeChapter: sanitizeTextField(item.activeChapter, 140),
    activeChapterStartedAt: isValidIso(item.activeChapterStartedAt) ? item.activeChapterStartedAt : undefined,
    updatedAt: isValidIso(item.updatedAt) ? item.updatedAt : item.startedAt,
  };
}

function secondsBetween(start: string, end: string): number {
  return Math.max(0, Math.floor((Date.parse(end) - Date.parse(start)) / 1_000));
}

export function computeSessionTimings(session: WorkspaceStudySession, nowMs = Date.now()) {
  const startMs = Date.parse(session.startedAt);
  if (!Number.isFinite(startMs)) {
    return { durationSeconds: 0, pausedSeconds: 0, pausedMs: 0, focusSeconds: 0 };
  }

  const endMsRaw = session.endedAt ? Date.parse(session.endedAt) : nowMs;
  const endMs = Number.isFinite(endMsRaw) ? Math.max(startMs, endMsRaw) : startMs;
  const totalElapsedMs = Math.max(0, endMs - startMs);

  const accumulatedPausedMs =
    typeof session.pausedMs === "number" && Number.isFinite(session.pausedMs)
      ? Math.max(0, session.pausedMs)
      : Math.max(0, session.pausedSeconds) * 1_000;

  let activePauseMs = 0;
  if (session.status === "paused" && session.activePauseStartedAt) {
    const pauseStartMs = Date.parse(session.activePauseStartedAt);
    if (Number.isFinite(pauseStartMs)) {
      activePauseMs = Math.max(0, endMs - pauseStartMs);
    }
  }

  const totalPausedMs = Math.min(totalElapsedMs, accumulatedPausedMs + activePauseMs);
  const focusMs = Math.max(0, totalElapsedMs - totalPausedMs);

  return {
    durationSeconds: Math.floor(totalElapsedMs / 1_000),
    pausedSeconds: Math.floor(totalPausedMs / 1_000),
    pausedMs: totalPausedMs,
    focusSeconds: Math.floor(focusMs / 1_000),
  };
}

function withSyncedDisplayTimings(session: WorkspaceStudySession, nowMs: number) {
  const timings = computeSessionTimings(session, nowMs);
  return {
    durationSeconds: timings.durationSeconds,
    pausedSeconds: timings.pausedSeconds,
    focusSeconds: timings.focusSeconds,
    // Keep accumulated pausedMs untouched while a pause is open so activePauseStartedAt is never double-counted.
    pausedMs: session.status === "paused" ? session.pausedMs : timings.pausedMs,
  };
}

function commitActiveChapter(session: WorkspaceStudySession, at: string): WorkspaceStudySession {
  if (session.status !== "active" || !session.activeChapter || !session.activeChapterStartedAt) return session;
  const elapsed = secondsBetween(session.activeChapterStartedAt, at);
  return {
    ...session,
    chapterSeconds: {
      ...(session.chapterSeconds ?? {}),
      [session.activeChapter]: (session.chapterSeconds?.[session.activeChapter] ?? 0) + elapsed,
    },
    activeChapterStartedAt: at,
  };
}

async function persist(session: WorkspaceStudySession): Promise<WorkspaceStudySession> {
  await StorageManager.put(
    "metadata",
    {
      key: `${WORKSPACE_SESSION_PREFIX}${session.id}`,
      value: session,
      updatedAt: session.updatedAt,
    } satisfies SessionRecord,
    { notify: false },
  );
  emitSessionsUpdated(session.id);
  return session;
}

export type StartSessionOptions = {
  userId?: string;
  subject?: string;
  studyTitle?: string;
  goalLabel?: string;
  origin?: StudySessionOrigin;
  focusMode?: boolean;
};

export const SessionTracker = {
  async get(sessionId: string): Promise<WorkspaceStudySession | null> {
    const record = await StorageManager.get<SessionRecord>("metadata", `${WORKSPACE_SESSION_PREFIX}${sessionId}`);
    return sanitizeStudySession(record?.value);
  },

  async listSessions(ownerFilter?: string): Promise<WorkspaceStudySession[]> {
    const session = SessionOperationManager.current();
    if (session.suspended) return [];

    const all = await StorageManager.getAll<{ key?: string; value?: unknown }>("metadata");
    const deduped = new Map<string, WorkspaceStudySession>();

    for (const row of all) {
      if (!row || typeof row.key !== "string" || !row.key.startsWith(WORKSPACE_SESSION_PREFIX)) continue;
      const sanitized = sanitizeStudySession(row.value);
      if (!sanitized) continue;
      if (ownerFilter && sanitized.userId && sanitized.userId !== ownerFilter) continue;

      const existing = deduped.get(sanitized.id);
      if (!existing || sanitized.updatedAt.localeCompare(existing.updatedAt) >= 0) {
        deduped.set(sanitized.id, sanitized);
      }
    }

    return [...deduped.values()].sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  },

  async listUnfinishedSessions(ownerFilter?: string): Promise<WorkspaceStudySession[]> {
    const all = await this.listSessions(ownerFilter);
    return all.filter((item) => item.status === "active" || item.status === "paused");
  },

  async start(
    studyId: string,
    fileIds: readonly string[] = [],
    tools: readonly WorkspacePanelType[] = [],
    options: StartSessionOptions = {},
  ): Promise<WorkspaceStudySession> {
    const timestamp = new Date().toISOString();
    return persist({
      id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      studyId,
      userId: sanitizeTextField(options.userId, 120),
      subject: sanitizeTextField(options.subject, 120),
      studyTitle: sanitizeTextField(options.studyTitle, 160),
      goalLabel: sanitizeTextField(options.goalLabel, 180),
      origin: options.origin ?? "workspace",
      focusMode: Boolean(options.focusMode),
      startedAt: timestamp,
      status: "active",
      durationSeconds: 0,
      focusSeconds: 0,
      pausedSeconds: 0,
      pausedMs: 0,
      pauseCount: 0,
      manualPause: false,
      fileIds: [...new Set(fileIds)],
      tools: [...new Set(tools)],
      chapterSeconds: {},
      updatedAt: timestamp,
    });
  },

  async enterFocusMode(
    session: WorkspaceStudySession,
    updates: { goalLabel?: string; subject?: string; studyTitle?: string } = {},
  ): Promise<WorkspaceStudySession> {
    if (session.status === "completed" || session.status === "cancelled") return session;
    const nowMs = Date.now();
    const timestamp = new Date(nowMs).toISOString();
    return persist({
      ...session,
      ...withSyncedDisplayTimings(session, nowMs),
      origin: "focus",
      focusMode: true,
      goalLabel: updates.goalLabel !== undefined ? sanitizeTextField(updates.goalLabel, 180) : session.goalLabel,
      subject: updates.subject ? sanitizeTextField(updates.subject, 120) : session.subject,
      studyTitle: updates.studyTitle ? sanitizeTextField(updates.studyTitle, 160) : session.studyTitle,
      updatedAt: timestamp,
    });
  },

  async exitFocusMode(session: WorkspaceStudySession): Promise<WorkspaceStudySession> {
    if (!session.focusMode) return session;
    const nowMs = Date.now();
    const timestamp = new Date(nowMs).toISOString();
    return persist({
      ...session,
      ...withSyncedDisplayTimings(session, nowMs),
      focusMode: false,
      updatedAt: timestamp,
    });
  },

  async updateGoalLabel(session: WorkspaceStudySession, goalLabel: string): Promise<WorkspaceStudySession> {
    if (session.status === "completed" || session.status === "cancelled") return session;
    const nowMs = Date.now();
    const timestamp = new Date(nowMs).toISOString();
    return persist({
      ...session,
      ...withSyncedDisplayTimings(session, nowMs),
      goalLabel: sanitizeTextField(goalLabel, 180),
      updatedAt: timestamp,
    });
  },

  async checkpoint(
    session: WorkspaceStudySession,
    fileIds: readonly string[],
    tools: readonly WorkspacePanelType[],
  ): Promise<WorkspaceStudySession> {
    if (session.status === "completed" || session.status === "cancelled") return session;
    const nowMs = Date.now();
    const timestamp = new Date(nowMs).toISOString();
    return persist({
      ...session,
      ...withSyncedDisplayTimings(session, nowMs),
      fileIds: [...new Set([...session.fileIds, ...fileIds])],
      tools: [...new Set([...session.tools, ...tools])],
      updatedAt: timestamp,
    });
  },

  async setChapter(session: WorkspaceStudySession, chapter?: string): Promise<WorkspaceStudySession> {
    if (session.status === "completed" || session.status === "cancelled") return session;
    const timestamp = new Date().toISOString();
    const committed = commitActiveChapter(session, timestamp);
    const nextChapter = chapter?.trim() || undefined;
    return persist({
      ...committed,
      activeChapter: nextChapter,
      activeChapterStartedAt: nextChapter && committed.status === "active" ? timestamp : undefined,
      updatedAt: timestamp,
    });
  },

  async pause(session: WorkspaceStudySession, manual = true): Promise<WorkspaceStudySession> {
    if (session.status !== "active") return session;
    const nowMs = Date.now();
    const timestamp = new Date(nowMs).toISOString();
    const committed = commitActiveChapter(session, timestamp);
    const timings = computeSessionTimings(committed, nowMs);
    return persist({
      ...committed,
      ...timings,
      status: "paused",
      activePauseStartedAt: timestamp,
      activeChapterStartedAt: undefined,
      manualPause: manual,
      pauseCount: committed.pauseCount + 1,
      updatedAt: timestamp,
    });
  },

  async resume(session: WorkspaceStudySession, onlyIfAutoPaused = false): Promise<WorkspaceStudySession> {
    if (session.status !== "paused") return session;
    if (onlyIfAutoPaused && session.manualPause) return session;
    const nowMs = Date.now();
    const timestamp = new Date(nowMs).toISOString();
    const timings = computeSessionTimings(session, nowMs);
    return persist({
      ...session,
      durationSeconds: timings.durationSeconds,
      pausedSeconds: timings.pausedSeconds,
      pausedMs: timings.pausedMs,
      focusSeconds: timings.focusSeconds,
      status: "active",
      activePauseStartedAt: undefined,
      manualPause: false,
      activeChapterStartedAt: session.activeChapter ? timestamp : undefined,
      updatedAt: timestamp,
    });
  },

  async finish(session: WorkspaceStudySession): Promise<WorkspaceStudySession> {
    const inflight = finishInFlight.get(session.id);
    if (inflight) return inflight;

    const run = (async () => {
      const persistedExisting = await this.get(session.id);
      if (persistedExisting && (persistedExisting.status === "completed" || persistedExisting.status === "cancelled")) {
        return persistedExisting;
      }

      const source = persistedExisting ?? session;
      const nowMs = Date.now();
      const timestamp = new Date(nowMs).toISOString();
      const committed = commitActiveChapter(source, timestamp);
      const timings = computeSessionTimings(committed, nowMs);

      const completedBase: WorkspaceStudySession = {
        ...committed,
        ...timings,
        status: "completed",
        focusMode: false,
        manualPause: false,
        activePauseStartedAt: undefined,
        activeChapterStartedAt: undefined,
        endedAt: timestamp,
        updatedAt: timestamp,
      };

      let completed = await persist(completedBase);

      if (completed.focusSeconds >= MIN_RECORDED_FOCUS_SECONDS && !completed.recordedAt) {
        const chapters = Object.entries(completed.chapterSeconds ?? {}).filter(([, seconds]) => seconds > 0);
        const rawAttributedSeconds = chapters.reduce((total, [, seconds]) => total + seconds, 0);
        const chapterScale = rawAttributedSeconds > completed.focusSeconds ? completed.focusSeconds / rawAttributedSeconds : 1;
        const attributedSeconds = Math.min(completed.focusSeconds, rawAttributedSeconds);

        for (const [chapter, seconds] of chapters) {
          await LearningService.recordActivity({
            type: "reading",
            studyId: completed.studyId,
            chapter,
            durationMinutes: (seconds * chapterScale) / 60,
            occurredAt: timestamp,
          });
        }

        const remainingSeconds = Math.max(0, completed.focusSeconds - attributedSeconds);
        if (remainingSeconds >= 1) {
          await LearningService.recordActivity({
            type: "reading",
            studyId: completed.studyId,
            durationMinutes: remainingSeconds / 60,
            occurredAt: timestamp,
          });
        }

        completed = await persist({
          ...completed,
          recordedAt: timestamp,
          updatedAt: new Date().toISOString(),
        });
      }

      return completed;
    })();

    finishInFlight.set(session.id, run);
    try {
      return await run;
    } finally {
      finishInFlight.delete(session.id);
    }
  },

  async cancel(session: WorkspaceStudySession): Promise<WorkspaceStudySession> {
    const persistedExisting = await this.get(session.id);
    if (persistedExisting && (persistedExisting.status === "completed" || persistedExisting.status === "cancelled")) {
      return persistedExisting;
    }

    const source = persistedExisting ?? session;
    const nowMs = Date.now();
    const timestamp = new Date(nowMs).toISOString();
    const timings = computeSessionTimings(source, nowMs);

    return persist({
      ...source,
      ...timings,
      status: "cancelled",
      focusMode: false,
      manualPause: false,
      activePauseStartedAt: undefined,
      activeChapterStartedAt: undefined,
      endedAt: timestamp,
      updatedAt: timestamp,
    });
  },
};
