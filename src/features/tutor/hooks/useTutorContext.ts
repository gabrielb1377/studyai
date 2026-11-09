"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/features/account/AuthProvider";
import { SessionOperationManager } from "@/features/account/SessionOperationManager";
import type { TutorStudyContext } from "@/types/tutor-context";
import { TutorContextService } from "../services/TutorContextService";

export function useTutorContext(studyId?: string) {
  const auth = useAuth();
  const [context, setContext] = useState<TutorStudyContext | null>(null);

  useEffect(() => {
    let active = true;
    const session = SessionOperationManager.current();
    setContext(null);
    if (auth.isLoading || session.suspended || !session.userId) return () => { active = false; };
    const reload = async () => {
      const next = await TutorContextService.loadCurrent(studyId);
      const current = SessionOperationManager.current();
      if (active && !current.suspended && current.userId === session.userId && current.generation === session.generation) {
        setContext(next);
      }
    };
    const handleReload = () => { void reload(); };
    void reload();
    window.addEventListener("studyai:study-updated", handleReload);
    window.addEventListener("studyai:notes-updated", handleReload);
    window.addEventListener("studyai:summaries-updated", handleReload);
    window.addEventListener("studyai:extraction-updated", handleReload);
    window.addEventListener("studyai:learning-updated", handleReload);

    return () => {
      active = false;
      window.removeEventListener("studyai:study-updated", handleReload);
      window.removeEventListener("studyai:notes-updated", handleReload);
      window.removeEventListener("studyai:summaries-updated", handleReload);
      window.removeEventListener("studyai:extraction-updated", handleReload);
      window.removeEventListener("studyai:learning-updated", handleReload);
    };
  }, [auth.isLoading, auth.session?.user.id, studyId]);

  return context;
}
