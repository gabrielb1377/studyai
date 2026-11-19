import {
  SessionChangedError,
  SessionOperationManager,
  type SessionOperation,
} from "@/features/account/SessionOperationManager";
import { currentDatabaseGeneration } from "@/lib/storage/Database";
import {
  MIN_RECORDED_FOCUS_SECONDS,
  sanitizeStudySession,
} from "@/features/workspace/services/SessionTracker";
import type { WorkspaceStudySession } from "@/features/workspace/types";
import { StorageManager } from "@/lib/storage/StorageManager";
import { PLANNING_UPDATED_EVENT } from "./PlanningStorage";
import { clampNumber, formatLocalDate } from "./PlanningValidation";

export const WEEKLY_GOAL_METADATA_KEY = "weekly-goal-v1";
export const WEEKLY_GOAL_UPDATED_EVENT = "studyai:weekly-goal-updated";

export const MIN_WEEKLY_MINUTES = 15;
export const MAX_WEEKLY_MINUTES = 3600;
export const MIN_WEEKLY_SESSIONS = 1;
export const MAX_WEEKLY_SESSIONS = 50;

export type WeeklyGoalType = "minutes" | "sessions";

export type WeeklyGoalConfig = {
  version: 1;
  type: WeeklyGoalType;
  target: number;
  userId?: string;
  weekKey: string;
  createdAt: string;
  updatedAt: string;
};

export type LocalWeekBounds = {
  weekKey: string;
  start: Date;
  endInclusive: Date;
  endExclusive: Date;
  startMs: number;
  endExclusiveMs: number;
  periodLabel: string;
};

export type WeeklyGoalProgress = {
  week: LocalWeekBounds;
  goal: WeeklyGoalConfig | null;
  countedSessions: WorkspaceStudySession[];
  completedSessions: number;
  completedSeconds: number;
  completedMinutes: number;
  currentValue: number;
  remainingValue: number;
  percent: number;
  achieved: boolean;
};

type WeeklyGoalRecord = {
  key: typeof WEEKLY_GOAL_METADATA_KEY;
  value: WeeklyGoalConfig | null;
  updatedAt: string;
};

/**
 * Regra de semana civil no fuso horário local:
 * Início no domingo às 00:00:00.000 e término no sábado às 23:59:59.999
 * (equivalente ao intervalo [domingo 00:00, próximo domingo 00:00[), consistente
 * com WeeklyProgress do Dashboard.
 */
export function getLocalWeekBounds(referenceDate = new Date()): LocalWeekBounds {
  const start = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate() - referenceDate.getDay(),
    0,
    0,
    0,
    0,
  );
  const endExclusive = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate() + 7,
    0,
    0,
    0,
    0,
  );
  const endInclusive = new Date(endExclusive.getTime() - 1);
  const fmt = (date: Date) => date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

  return {
    weekKey: formatLocalDate(start),
    start,
    endInclusive,
    endExclusive,
    startMs: start.getTime(),
    endExclusiveMs: endExclusive.getTime(),
    periodLabel: `${fmt(start)} – ${fmt(endInclusive)}`,
  };
}

export function clampWeeklyGoalTarget(type: WeeklyGoalType, value: unknown): number {
  if (type === "sessions") {
    return clampNumber(value, MIN_WEEKLY_SESSIONS, MAX_WEEKLY_SESSIONS, 5);
  }
  return clampNumber(value, MIN_WEEKLY_MINUTES, MAX_WEEKLY_MINUTES, 180);
}

export function sanitizeWeeklyGoal(raw: unknown, expectedUserId?: string): WeeklyGoalConfig | null {
  if (typeof raw !== "object" || raw === null) return null;
  const candidate = raw as Partial<WeeklyGoalConfig>;
  if (candidate.version !== 1) return null;
  if (candidate.type !== "minutes" && candidate.type !== "sessions") return null;

  const userId =
    typeof candidate.userId === "string" && candidate.userId.trim()
      ? candidate.userId.trim().slice(0, 120)
      : undefined;
  if (expectedUserId && userId && userId !== expectedUserId) return null;

  const num = typeof candidate.target === "number" ? candidate.target : Number(candidate.target);
  if (!Number.isFinite(num) || num <= 0) return null;

  const target = clampWeeklyGoalTarget(candidate.type, num);
  const nowIso = new Date().toISOString();
  const weekKey =
    typeof candidate.weekKey === "string" && /^\d{4}-\d{2}-\d{2}$/.test(candidate.weekKey)
      ? candidate.weekKey
      : getLocalWeekBounds().weekKey;

  return {
    version: 1,
    type: candidate.type,
    target,
    userId,
    weekKey,
    createdAt:
      typeof candidate.createdAt === "string" && Number.isFinite(Date.parse(candidate.createdAt))
        ? candidate.createdAt
        : nowIso,
    updatedAt:
      typeof candidate.updatedAt === "string" && Number.isFinite(Date.parse(candidate.updatedAt))
        ? candidate.updatedAt
        : nowIso,
  };
}

export function computeWeeklyGoalProgress(
  goal: WeeklyGoalConfig | null,
  sessions: readonly WorkspaceStudySession[],
  referenceDate = new Date(),
  expectedUserId?: string,
): WeeklyGoalProgress {
  const week = getLocalWeekBounds(referenceDate);
  const seenIds = new Set<string>();
  const countedSessions: WorkspaceStudySession[] = [];

  for (const rawSession of sessions) {
    const clean = sanitizeStudySession(rawSession);
    if (!clean) continue;
    if (seenIds.has(clean.id)) continue;
    seenIds.add(clean.id);

    if (clean.status !== "completed") continue;
    if (clean.focusSeconds < MIN_RECORDED_FOCUS_SECONDS) continue;
    if (expectedUserId && clean.userId && clean.userId !== expectedUserId) continue;

    const completedTimestamp = clean.endedAt ?? clean.updatedAt;
    const completedMs = Date.parse(completedTimestamp);
    if (!Number.isFinite(completedMs)) continue;
    if (completedMs < week.startMs || completedMs >= week.endExclusiveMs) continue;

    countedSessions.push(clean);
  }

  countedSessions.sort((left, right) => {
    const leftTs = left.endedAt ?? left.updatedAt;
    const rightTs = right.endedAt ?? right.updatedAt;
    return rightTs.localeCompare(leftTs);
  });

  const completedSeconds = countedSessions.reduce((sum, item) => sum + item.focusSeconds, 0);
  const completedMinutes = Math.floor(completedSeconds / 60);
  const completedSessions = countedSessions.length;

  if (!goal) {
    return {
      week,
      goal: null,
      countedSessions,
      completedSessions,
      completedSeconds,
      completedMinutes,
      currentValue: 0,
      remainingValue: 0,
      percent: 0,
      achieved: false,
    };
  }

  const currentValue = goal.type === "minutes" ? completedMinutes : completedSessions;
  const remainingValue = Math.max(0, goal.target - currentValue);
  const percent = Math.min(100, Math.round((currentValue / Math.max(1, goal.target)) * 100));

  return {
    week,
    goal,
    countedSessions,
    completedSessions,
    completedSeconds,
    completedMinutes,
    currentValue,
    remainingValue,
    percent,
    achieved: currentValue >= goal.target,
  };
}

function emitWeeklyGoalUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(WEEKLY_GOAL_UPDATED_EVENT));
    window.dispatchEvent(new Event(PLANNING_UPDATED_EVENT));
  }
}

export const WeeklyGoalStorage = {
  async load(expectedUserId?: string): Promise<WeeklyGoalConfig | null> {
    const session = SessionOperationManager.current();
    if (session.suspended) return null;

    const record = await StorageManager.get<WeeklyGoalRecord>("metadata", WEEKLY_GOAL_METADATA_KEY);
    return sanitizeWeeklyGoal(record?.value, expectedUserId);
  },

  async save(
    input: { type: WeeklyGoalType; target: number },
    ownerId?: string,
    referenceDate = new Date(),
  ): Promise<WeeklyGoalConfig> {
    const sessionState = SessionOperationManager.current();
    const resolvedOwner = ownerId ?? sessionState.userId ?? "guest";
    const existing = await this.load(resolvedOwner);
    const nowIso = referenceDate.toISOString();
    const next = sanitizeWeeklyGoal(
      {
        version: 1,
        type: input.type,
        target: clampWeeklyGoalTarget(input.type, input.target),
        userId: resolvedOwner,
        weekKey: getLocalWeekBounds(referenceDate).weekKey,
        createdAt: existing?.createdAt ?? nowIso,
        updatedAt: nowIso,
      },
      resolvedOwner,
    );

    if (!next) {
      throw new Error("Não foi possível validar a meta semanal informada.");
    }

    const operation: SessionOperation | null = sessionState.userId
      ? SessionOperationManager.start()
      : null;
    const generationBefore = currentDatabaseGeneration();
    const assertWriteSafe = () => {
      if (operation) {
        operation.assertCurrent();
        return;
      }
      const latest = SessionOperationManager.current();
      if (latest.suspended || latest.userId || currentDatabaseGeneration() !== generationBefore) {
        throw new SessionChangedError();
      }
    };

    try {
      const record = await StorageManager.updateMetadata<WeeklyGoalRecord>(
        WEEKLY_GOAL_METADATA_KEY,
        () => {
          assertWriteSafe();
          return {
            key: WEEKLY_GOAL_METADATA_KEY,
            value: next,
            updatedAt: next.updatedAt,
          };
        },
      );
      assertWriteSafe();
      emitWeeklyGoalUpdated();
      return record.value ?? next;
    } finally {
      operation?.release();
    }
  },

  async clear(): Promise<void> {
    const sessionState = SessionOperationManager.current();
    if (sessionState.suspended) {
      throw new SessionChangedError();
    }
    const operation: SessionOperation | null = sessionState.userId
      ? SessionOperationManager.start()
      : null;
    const generationBefore = currentDatabaseGeneration();
    const assertWriteSafe = () => {
      if (operation) {
        operation.assertCurrent();
        return;
      }
      const latest = SessionOperationManager.current();
      if (latest.suspended || latest.userId || currentDatabaseGeneration() !== generationBefore) {
        throw new SessionChangedError();
      }
    };

    try {
      await StorageManager.updateMetadata<WeeklyGoalRecord>(WEEKLY_GOAL_METADATA_KEY, () => {
        assertWriteSafe();
        return {
          key: WEEKLY_GOAL_METADATA_KEY,
          value: null,
          updatedAt: new Date().toISOString(),
        };
      });
      assertWriteSafe();
      emitWeeklyGoalUpdated();
    } finally {
      operation?.release();
    }
  },
};
