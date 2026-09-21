"use client";

import { useEffect, useRef, useState } from "react";
import { SessionTracker } from "./services/SessionTracker";
import type { WorkspacePanelType, WorkspaceStudySession } from "./types";

export function useWorkspaceSession(studyId: string, fileIds: readonly string[], tools: readonly WorkspacePanelType[]) {
  const [session, setSession] = useState<WorkspaceStudySession>();
  const sessionRef = useRef<WorkspaceStudySession | undefined>(undefined);
  const fileKey = fileIds.join("|");
  const toolKey = tools.join("|");

  useEffect(() => {
    let active = true;
    void SessionTracker.start(studyId, fileIds, tools).then((created) => {
      if (!active) return;
      sessionRef.current = created;
      setSession(created);
    });
    return () => {
      active = false;
      if (sessionRef.current) void SessionTracker.finish(sessionRef.current);
    };
  // A mudança de estudo cria outra sessão; arquivos e ferramentas são atualizados por checkpoint.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyId]);

  useEffect(() => {
    const checkpoint = () => {
      if (!sessionRef.current || sessionRef.current.status === "completed") return;
      void SessionTracker.checkpoint(sessionRef.current, fileIds, tools).then((updated) => {
        sessionRef.current = updated;
        setSession(updated);
      });
    };
    checkpoint();
    const interval = window.setInterval(checkpoint, 30_000);
    return () => window.clearInterval(interval);
  // Chaves estabilizam arrays derivados sem disparar a cada render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileKey, toolKey]);

  useEffect(() => {
    const onVisibility = () => {
      const current = sessionRef.current;
      if (!current) return;
      const action = document.visibilityState === "hidden" ? SessionTracker.pause(current) : SessionTracker.resume(current);
      void action.then((updated) => { sessionRef.current = updated; setSession(updated); });
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const pause = async () => {
    if (!sessionRef.current) return;
    const updated = await SessionTracker.pause(sessionRef.current);
    sessionRef.current = updated;
    setSession(updated);
  };
  const resume = async () => {
    if (!sessionRef.current) return;
    const updated = await SessionTracker.resume(sessionRef.current);
    sessionRef.current = updated;
    setSession(updated);
  };
  const finish = async () => {
    if (!sessionRef.current) return;
    const updated = await SessionTracker.finish(sessionRef.current);
    sessionRef.current = updated;
    setSession(updated);
  };
  return { session, pause, resume, finish };
}
