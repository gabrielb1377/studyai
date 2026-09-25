import { LearningService } from "@/features/learning/LearningService";
import { StorageManager } from "@/lib/storage/StorageManager";
import type { WorkspacePanelType, WorkspaceStudySession } from "../types";

const PREFIX = "workspace-session:";

type SessionRecord = {
  key: string;
  value: WorkspaceStudySession;
  updatedAt: string;
};

function secondsBetween(start: string, end: string) {
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1_000));
}

function calculate(session: WorkspaceStudySession, at = new Date().toISOString()) {
  const durationSeconds = secondsBetween(session.startedAt, session.endedAt ?? at);
  const activePause = session.activePauseStartedAt ? secondsBetween(session.activePauseStartedAt, at) : 0;
  const pausedSeconds = session.pausedSeconds + activePause;
  return { durationSeconds, pausedSeconds, focusSeconds: Math.max(0, durationSeconds - pausedSeconds) };
}

function commitActiveChapter(session: WorkspaceStudySession, at: string) {
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

async function persist(session: WorkspaceStudySession) {
  await StorageManager.put("metadata", {
    key: `${PREFIX}${session.id}`,
    value: session,
    updatedAt: session.updatedAt,
  } satisfies SessionRecord);
  return session;
}

export const SessionTracker = {
  async start(studyId: string, fileIds: readonly string[] = [], tools: readonly WorkspacePanelType[] = []) {
    const timestamp = new Date().toISOString();
    return persist({
      id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      studyId,
      startedAt: timestamp,
      status: "active",
      durationSeconds: 0,
      focusSeconds: 0,
      pausedSeconds: 0,
      pauseCount: 0,
      fileIds: [...new Set(fileIds)],
      tools: [...new Set(tools)],
      chapterSeconds: {},
      updatedAt: timestamp,
    });
  },

  async checkpoint(session: WorkspaceStudySession, fileIds: readonly string[], tools: readonly WorkspacePanelType[]) {
    const timestamp = new Date().toISOString();
    return persist({
      ...session,
      ...calculate(session, timestamp),
      fileIds: [...new Set([...session.fileIds, ...fileIds])],
      tools: [...new Set([...session.tools, ...tools])],
      updatedAt: timestamp,
    });
  },

  async setChapter(session: WorkspaceStudySession, chapter?: string) {
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

  async pause(session: WorkspaceStudySession) {
    if (session.status !== "active") return session;
    const timestamp = new Date().toISOString();
    const committed = commitActiveChapter(session, timestamp);
    return persist({ ...committed, ...calculate(committed, timestamp), status: "paused", activePauseStartedAt: timestamp, activeChapterStartedAt: undefined, pauseCount: session.pauseCount + 1, updatedAt: timestamp });
  },

  async resume(session: WorkspaceStudySession) {
    if (session.status !== "paused") return session;
    const timestamp = new Date().toISOString();
    const pausedSeconds = session.pausedSeconds + (session.activePauseStartedAt ? secondsBetween(session.activePauseStartedAt, timestamp) : 0);
    return persist({ ...session, pausedSeconds, focusSeconds: Math.max(0, secondsBetween(session.startedAt, timestamp) - pausedSeconds), status: "active", activePauseStartedAt: undefined, activeChapterStartedAt: session.activeChapter ? timestamp : undefined, updatedAt: timestamp });
  },

  async finish(session: WorkspaceStudySession) {
    if (session.status === "completed") return session;
    const timestamp = new Date().toISOString();
    const committed = commitActiveChapter(session, timestamp);
    const calculated = calculate(committed, timestamp);
    const completed = await persist({ ...committed, ...calculated, status: "completed", activePauseStartedAt: undefined, activeChapterStartedAt: undefined, endedAt: timestamp, updatedAt: timestamp });
    if (completed.focusSeconds >= 5) {
      const chapters = Object.entries(completed.chapterSeconds ?? {}).filter(([, seconds]) => seconds > 0);
      const rawAttributedSeconds = chapters.reduce((total, [, seconds]) => total + seconds, 0);
      const chapterScale = rawAttributedSeconds > completed.focusSeconds ? completed.focusSeconds / rawAttributedSeconds : 1;
      const attributedSeconds = Math.min(completed.focusSeconds, rawAttributedSeconds);
      for (const [chapter, seconds] of chapters) {
        await LearningService.recordActivity({ type: "reading", studyId: completed.studyId, chapter, durationMinutes: seconds * chapterScale / 60 });
      }
      const remainingSeconds = Math.max(0, completed.focusSeconds - attributedSeconds);
      if (remainingSeconds >= 1) await LearningService.recordActivity({ type: "reading", studyId: completed.studyId, durationMinutes: remainingSeconds / 60 });
    }
    return completed;
  },

  async history(studyId?: string) {
    const records = await StorageManager.getAll<SessionRecord>("metadata");
    return records.filter((record) => record.key.startsWith(PREFIX) && (!studyId || record.value.studyId === studyId)).map((record) => record.value).sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  },
};
