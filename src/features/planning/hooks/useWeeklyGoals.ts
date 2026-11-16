"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/features/account/AuthProvider";
import { SessionOperationManager } from "@/features/account/SessionOperationManager";
import {
  SESSIONS_UPDATED_EVENT,
  SessionTracker,
} from "@/features/workspace/services/SessionTracker";
import type { WorkspaceStudySession } from "@/features/workspace/types";
import { STORAGE_UPDATED_EVENT } from "@/lib/storage/StorageManager";
import { PLANNING_UPDATED_EVENT } from "../PlanningStorage";
import {
  WEEKLY_GOAL_UPDATED_EVENT,
  WeeklyGoalStorage,
  computeWeeklyGoalProgress,
  type WeeklyGoalConfig,
  type WeeklyGoalType,
} from "../WeeklyGoals";

const FOCUS_CHANNEL_NAME = "studyai:focus-session";

export function useWeeklyGoals() {
  const auth = useAuth();
  const [goal, setGoal] = useState<WeeklyGoalConfig | null>(null);
  const [sessions, setSessions] = useState<WorkspaceStudySession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const revisionRef = useRef(0);

  const sessionState = SessionOperationManager.current();
  const ownerId = !auth.isLoading && !sessionState.suspended
    ? auth.session?.user.id ?? sessionState.userId ?? "guest"
    : undefined;

  const reload = useCallback(async () => {
    const requestId = ++revisionRef.current;
    const currentSession = SessionOperationManager.current();
    if (auth.isLoading || currentSession.suspended || !ownerId) {
      setGoal(null);
      setSessions([]);
      setIsLoading(auth.isLoading || currentSession.suspended);
      return;
    }

    try {
      const [loadedGoal, loadedSessions] = await Promise.all([
        WeeklyGoalStorage.load(ownerId),
        SessionTracker.listSessions(ownerId),
      ]);
      if (requestId !== revisionRef.current) return;
      setNow(new Date());
      setGoal(loadedGoal);
      setSessions(loadedSessions);
      setError(null);
    } catch (caught) {
      if (requestId !== revisionRef.current) return;
      setGoal(null);
      setSessions([]);
      setError(caught instanceof Error ? caught.message : "Não foi possível carregar as metas semanais.");
    } finally {
      if (requestId === revisionRef.current) {
        setIsLoading(false);
      }
    }
  }, [auth.isLoading, ownerId]);

  useEffect(() => {
    setGoal(null);
    setSessions([]);
    setIsLoading(true);
    void reload();

    const handleRefresh = () => {
      void reload();
    };
    const handleStorage = (event: Event) => {
      const detail = (event as CustomEvent<{ store?: string; scopeChanged?: boolean }>).detail;
      if (!detail || detail.scopeChanged || detail.store === "metadata") {
        void reload();
      }
    };

    window.addEventListener(WEEKLY_GOAL_UPDATED_EVENT, handleRefresh);
    window.addEventListener(SESSIONS_UPDATED_EVENT, handleRefresh);
    window.addEventListener(PLANNING_UPDATED_EVENT, handleRefresh);
    window.addEventListener(STORAGE_UPDATED_EVENT, handleStorage);
    window.addEventListener("focus", handleRefresh);

    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      try {
        channel = new BroadcastChannel(FOCUS_CHANNEL_NAME);
        channel.onmessage = () => {
          void reload();
        };
      } catch {
        channel = null;
      }
    }

    const clockInterval = window.setInterval(() => {
      setNow(new Date());
    }, 60_000);

    return () => {
      revisionRef.current += 1;
      window.removeEventListener(WEEKLY_GOAL_UPDATED_EVENT, handleRefresh);
      window.removeEventListener(SESSIONS_UPDATED_EVENT, handleRefresh);
      window.removeEventListener(PLANNING_UPDATED_EVENT, handleRefresh);
      window.removeEventListener(STORAGE_UPDATED_EVENT, handleStorage);
      window.removeEventListener("focus", handleRefresh);
      window.clearInterval(clockInterval);
      channel?.close();
    };
  }, [reload]);

  const saveGoal = useCallback(
    async (input: { type: WeeklyGoalType; target: number }) => {
      if (!ownerId) return null;
      setIsSaving(true);
      setError(null);
      try {
        const saved = await WeeklyGoalStorage.save(input, ownerId, new Date());
        setGoal(saved);
        return saved;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Não foi possível salvar a meta semanal.");
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [ownerId],
  );

  const clearGoal = useCallback(async () => {
    if (!ownerId) return;
    setIsSaving(true);
    setError(null);
    try {
      await WeeklyGoalStorage.clear();
      setGoal(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível remover a meta semanal.");
    } finally {
      setIsSaving(false);
    }
  }, [ownerId]);

  const progress = useMemo(
    () => computeWeeklyGoalProgress(goal, sessions, now, ownerId),
    [goal, now, ownerId, sessions],
  );

  return {
    goal,
    sessions,
    progress,
    isLoading,
    isSaving,
    error,
    saveGoal,
    clearGoal,
    reload,
  };
}
