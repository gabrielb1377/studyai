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

  async pause(session: WorkspaceStudySession) {
    if (session.status !== "active") return session;
    const timestamp = new Date().toISOString();
    return persist({ ...session, ...calculate(session, timestamp), status: "paused", activePauseStartedAt: timestamp, pauseCount: session.pauseCount + 1, updatedAt: timestamp });
  },

  async resume(session: WorkspaceStudySession) {
    if (session.status !== "paused") return session;
    const timestamp = new Date().toISOString();
    const pausedSeconds = session.pausedSeconds + (session.activePauseStartedAt ? secondsBetween(session.activePauseStartedAt, timestamp) : 0);
    return persist({ ...session, pausedSeconds, focusSeconds: Math.max(0, secondsBetween(session.startedAt, timestamp) - pausedSeconds), status: "active", activePauseStartedAt: undefined, updatedAt: timestamp });
  },

  async finish(session: WorkspaceStudySession) {
    if (session.status === "completed") return session;
    const timestamp = new Date().toISOString();
    const calculated = calculate(session, timestamp);
    const completed = await persist({ ...session, ...calculated, status: "completed", activePauseStartedAt: undefined, endedAt: timestamp, updatedAt: timestamp });
    if (completed.focusSeconds >= 5) {
      await LearningService.recordActivity({ type: "reading", studyId: completed.studyId, durationMinutes: completed.focusSeconds / 60 });
    }
    return completed;
  },

  async history(studyId?: string) {
    const records = await StorageManager.getAll<SessionRecord>("metadata");
    return records.filter((record) => record.key.startsWith(PREFIX) && (!studyId || record.value.studyId === studyId)).map((record) => record.value).sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  },
};
