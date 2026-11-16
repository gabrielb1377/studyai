"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/features/account/AuthProvider";
import { SessionOperationManager } from "@/features/account/SessionOperationManager";
import {
  SESSIONS_UPDATED_EVENT,
  SessionTracker,
  computeSessionTimings,
} from "./services/SessionTracker";
import type { WorkspacePanelType, WorkspaceStudySession } from "./types";

const FOCUS_CHANNEL_NAME = "studyai:focus-session";
const initLocks = new Map<string, Promise<void>>();

function broadcastSessionSync(ownerId: string, sessionId: string) {
  if (typeof BroadcastChannel === "undefined") return;
  try {
    const channel = new BroadcastChannel(FOCUS_CHANNEL_NAME);
    channel.postMessage({ type: "session-updated", ownerId, sessionId });
    channel.close();
  } catch {
    // Ignore environments that restrict BroadcastChannel
  }
}

export function useWorkspaceSession(
  studyId: string,
  fileIds: readonly string[],
  tools: readonly WorkspacePanelType[],
  meta: { subject?: string; studyTitle?: string } = {},
) {
  const auth = useAuth();
  const sessionState = SessionOperationManager.current();
  const ownerId =
    !auth.isLoading && !sessionState.suspended
      ? auth.session?.user.id ?? sessionState.userId ?? "guest"
      : undefined;

  const [session, setSession] = useState<WorkspaceStudySession>();
  const [pendingRecovery, setPendingRecovery] = useState<WorkspaceStudySession[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const sessionRef = useRef<WorkspaceStudySession | undefined>(undefined);
  const ownerRef = useRef<string | undefined>(ownerId);
  const fileKey = fileIds.join("|");
  const toolKey = tools.join("|");
  const subject = meta.subject;
  const studyTitle = meta.studyTitle;

  const setManagedSession = useCallback((next: WorkspaceStudySession | undefined, notify = false) => {
    sessionRef.current = next;
    setSession(next);
    setNowMs(Date.now());
    if (notify && next && ownerRef.current) {
      broadcastSessionSync(ownerRef.current, next.id);
    }
  }, []);

  // Reset immediately on user change or suspended session so no timer crosses accounts.
  useEffect(() => {
    ownerRef.current = ownerId;
    if (!ownerId) {
      sessionRef.current = undefined;
      setSession(undefined);
      setPendingRecovery([]);
    }
  }, [ownerId]);

  // Initial load / reload recovery without creating duplicate sessions.
  useEffect(() => {
    if (!ownerId || !studyId) return;

    let active = true;
    const lockKey = `${ownerId}:${studyId}`;
    const prevLock = initLocks.get(lockKey) ?? Promise.resolve();

    const task = prevLock
      .catch(() => undefined)
      .then(async () => {
        if (!active || ownerRef.current !== ownerId) return;
        const unfinished = await SessionTracker.listUnfinishedSessions(ownerId);
        if (!active || ownerRef.current !== ownerId) return;

        if (unfinished.length === 0) {
          const created = await SessionTracker.start(studyId, fileIds, tools, {
            userId: ownerId,
            subject,
            studyTitle,
            origin: "workspace",
            focusMode: false,
          });
          if (!active || ownerRef.current !== ownerId) return;
          setPendingRecovery([]);
          setManagedSession(created, true);
          return;
        }

        if (unfinished.length === 1 && unfinished[0].studyId === studyId) {
          setPendingRecovery([]);
          setManagedSession(unfinished[0], false);
          return;
        }

        if (
          unfinished.length === 1 &&
          unfinished[0].studyId !== studyId &&
          unfinished[0].origin !== "focus" &&
          computeSessionTimings(unfinished[0], Date.now()).focusSeconds < 5
        ) {
          await SessionTracker.cancel(unfinished[0]);
          if (!active || ownerRef.current !== ownerId) return;
          const created = await SessionTracker.start(studyId, fileIds, tools, {
            userId: ownerId,
            subject,
            studyTitle,
            origin: "workspace",
            focusMode: false,
          });
          if (!active || ownerRef.current !== ownerId) return;
          setPendingRecovery([]);
          setManagedSession(created, true);
          return;
        }

        // Ambiguous recovery: multiple unfinished sessions or active session on another study.
        setManagedSession(undefined, false);
        setPendingRecovery(unfinished);
      });

    const tracked = task.finally(() => {
      if (initLocks.get(lockKey) === tracked) {
        initLocks.delete(lockKey);
      }
    });
    initLocks.set(lockKey, tracked);

    return () => {
      active = false;
    };
    // Initial session restoration/creation is keyed on studyId + ownerId; fileIds/tools update via checkpoint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId, studyId]);

  // Live 1-second timestamp tick strictly when active (zero counter drift).
  useEffect(() => {
    if (!ownerId || session?.status !== "active") return;
    setNowMs(Date.now());
    const tick = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1_000);
    return () => window.clearInterval(tick);
  }, [ownerId, session?.id, session?.status]);

  // Periodic checkpointing when active/paused + checkpoint before leaving page.
  useEffect(() => {
    if (!ownerId || !session?.id) return;
    const checkpoint = () => {
      const current = sessionRef.current;
      if (!current || current.status === "completed" || current.status === "cancelled") return;
      if (ownerRef.current !== ownerId) return;
      void SessionTracker.checkpoint(current, fileIds, tools).then((updated) => {
        if (ownerRef.current !== ownerId) return;
        sessionRef.current = updated;
        setSession(updated);
      }).catch(() => undefined);
    };

    checkpoint();
    const interval = window.setInterval(checkpoint, 30_000);
    const onPageHide = () => checkpoint();
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("pagehide", onPageHide);
    };
    // Chaves estabilizam arrays derivados sem disparar a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId, session?.id, fileKey, toolKey]);

  // Sync visibility return & cross-tab updates without inventing or duplicating time.
  useEffect(() => {
    if (!ownerId) return;
    const syncCurrent = async () => {
      const current = sessionRef.current;
      if (!current || ownerRef.current !== ownerId) return;
      const latest = await SessionTracker.get(current.id);
      if (latest && (!latest.userId || latest.userId === ownerId)) {
        sessionRef.current = latest;
        setSession(latest);
        setNowMs(Date.now());
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        setNowMs(Date.now());
        void syncCurrent();
      } else {
        const current = sessionRef.current;
        if (current && current.status === "active") {
          void SessionTracker.checkpoint(current, fileIds, tools).then((updated) => {
            if (ownerRef.current !== ownerId) return;
            sessionRef.current = updated;
            setSession(updated);
          }).catch(() => undefined);
        }
      }
    };

    const onExternalSessionEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ sessionId?: string }>).detail;
      if (detail?.sessionId && detail.sessionId === sessionRef.current?.id) {
        setNowMs(Date.now());
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener(SESSIONS_UPDATED_EVENT, onExternalSessionEvent);

    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      try {
        channel = new BroadcastChannel(FOCUS_CHANNEL_NAME);
        channel.onmessage = (message: MessageEvent<{ ownerId?: string; sessionId?: string }>) => {
          if (message.data?.ownerId === ownerId && message.data?.sessionId === sessionRef.current?.id) {
            void syncCurrent();
          }
        };
      } catch {
        channel = null;
      }
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener(SESSIONS_UPDATED_EVENT, onExternalSessionEvent);
      channel?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId, studyId]);

  useEffect(() => {
    const onChapter = (event: Event) => {
      const detail = (event as CustomEvent<{ studyId?: string; chapter?: string }>).detail;
      const current = sessionRef.current;
      if (!current || detail?.studyId !== studyId || current.status === "completed" || current.status === "cancelled") {
        return;
      }
      void SessionTracker.setChapter(current, detail.chapter).then((updated) => {
        setManagedSession(updated, false);
      }).catch(() => undefined);
    };
    window.addEventListener("studyai:workspace-chapter", onChapter);
    return () => window.removeEventListener("studyai:workspace-chapter", onChapter);
  }, [setManagedSession, studyId]);

  const enterFocusMode = useCallback(
    async (goalLabel?: string) => {
      if (!ownerId) return;
      const current = sessionRef.current;
      if (!current || current.status === "completed" || current.status === "cancelled") {
        const created = await SessionTracker.start(studyId, fileIds, tools, {
          userId: ownerId,
          subject,
          studyTitle,
          goalLabel,
          origin: "focus",
          focusMode: true,
        });
        setPendingRecovery([]);
        setManagedSession(created, true);
        return;
      }
      const updated = await SessionTracker.enterFocusMode(current, {
        goalLabel,
        subject,
        studyTitle,
      });
      setManagedSession(updated, true);
    },
    [fileIds, ownerId, setManagedSession, studyId, studyTitle, subject, tools],
  );

  const startNewFocusSession = useCallback(
    async (goalLabel?: string) => {
      if (!ownerId) return;
      const current = sessionRef.current;
      if (current && (current.status === "active" || current.status === "paused")) {
        await SessionTracker.cancel(current);
      }
      const created = await SessionTracker.start(studyId, fileIds, tools, {
        userId: ownerId,
        subject,
        studyTitle,
        goalLabel,
        origin: "focus",
        focusMode: true,
      });
      setPendingRecovery([]);
      setManagedSession(created, true);
    },
    [fileIds, ownerId, setManagedSession, studyId, studyTitle, subject, tools],
  );

  const exitFocusMode = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return;
    const updated = await SessionTracker.exitFocusMode(current);
    setManagedSession(updated, true);
  }, [setManagedSession]);

  const updateGoalLabel = useCallback(
    async (goalLabel: string) => {
      const current = sessionRef.current;
      if (!current) return;
      const updated = await SessionTracker.updateGoalLabel(current, goalLabel);
      setManagedSession(updated, true);
    },
    [setManagedSession],
  );

  const pause = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return;
    const updated = await SessionTracker.pause(current, true);
    setManagedSession(updated, true);
  }, [setManagedSession]);

  const resume = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return;
    const updated = await SessionTracker.resume(current, false);
    setManagedSession(updated, true);
  }, [setManagedSession]);

  const finish = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return;
    const updated = await SessionTracker.finish(current);
    setManagedSession(updated, true);
  }, [setManagedSession]);

  const cancel = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return;
    const updated = await SessionTracker.cancel(current);
    setManagedSession(updated, true);
  }, [setManagedSession]);

  const resumeRecoveredSession = useCallback(
    async (targetSessionId: string) => {
      if (!ownerId) return;
      const target = pendingRecovery.find((item) => item.id === targetSessionId);
      if (!target) return;
      for (const item of pendingRecovery) {
        if (item.id !== targetSessionId) {
          await SessionTracker.cancel(item);
        }
      }
      setPendingRecovery([]);
      if (target.studyId === studyId) {
        setManagedSession(target, true);
      } else {
        const created = await SessionTracker.start(studyId, fileIds, tools, {
          userId: ownerId,
          subject,
          studyTitle,
          origin: "workspace",
          focusMode: false,
        });
        setManagedSession(created, true);
      }
    },
    [fileIds, ownerId, pendingRecovery, setManagedSession, studyId, studyTitle, subject, tools],
  );

  const completeRecoveredAndStart = useCallback(async () => {
    if (!ownerId) return;
    for (const item of pendingRecovery) {
      const timings = computeSessionTimings(item, Date.now());
      if (timings.focusSeconds >= 5) {
        await SessionTracker.finish(item);
      } else {
        await SessionTracker.cancel(item);
      }
    }
    setPendingRecovery([]);
    const created = await SessionTracker.start(studyId, fileIds, tools, {
      userId: ownerId,
      subject,
      studyTitle,
      origin: "workspace",
      focusMode: false,
    });
    setManagedSession(created, true);
  }, [fileIds, ownerId, pendingRecovery, setManagedSession, studyId, studyTitle, subject, tools]);

  const discardRecoveredAndStart = useCallback(async () => {
    if (!ownerId) return;
    for (const item of pendingRecovery) {
      await SessionTracker.cancel(item);
    }
    setPendingRecovery([]);
    const created = await SessionTracker.start(studyId, fileIds, tools, {
      userId: ownerId,
      subject,
      studyTitle,
      origin: "workspace",
      focusMode: false,
    });
    setManagedSession(created, true);
  }, [fileIds, ownerId, pendingRecovery, setManagedSession, studyId, studyTitle, subject, tools]);

  const effectiveSession = useMemo<WorkspaceStudySession | undefined>(() => {
    if (!session) return undefined;
    if (session.status === "completed" || session.status === "cancelled") {
      return session;
    }
    const timings = computeSessionTimings(session, nowMs);
    return {
      ...session,
      ...timings,
    };
  }, [nowMs, session]);

  return {
    session: effectiveSession,
    pendingRecovery,
    enterFocusMode,
    startNewFocusSession,
    exitFocusMode,
    updateGoalLabel,
    pause,
    resume,
    finish,
    cancel,
    resumeRecoveredSession,
    completeRecoveredAndStart,
    discardRecoveredAndStart,
  };
}
