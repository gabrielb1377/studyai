"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/features/account/AuthProvider";
import { SessionOperationManager } from "@/features/account/SessionOperationManager";
import type { TutorStudyContext } from "@/types/tutor-context";
import { ERROR_NOTEBOOK_UPDATED_EVENT } from "@/features/learning/errors/ErrorNotebookStorage";
import { LONG_TERM_MEMORY_UPDATED_EVENT } from "@/features/learning/memory/LongTermMemoryStorage";
import { TutorContextService } from "../services/TutorContextService";

export function useTutorContext(studyId?: string) {
  const auth = useAuth();
  const [context, setContext] = useState<TutorStudyContext | null>(null);
  const requestVersion = useRef(0);

  useEffect(() => {
    let active = true;
    const version = ++requestVersion.current;
    const session = SessionOperationManager.current();
    setContext(null);
    if (auth.isLoading || session.suspended || !session.userId) {
      return () => {
        active = false;
        requestVersion.current += 1;
      };
    }
    const reload = async () => {
      const currentVersion = ++requestVersion.current;
      const next = await TutorContextService.loadCurrent(studyId);
      const current = SessionOperationManager.current();
      if (
        active &&
        currentVersion === requestVersion.current &&
        !current.suspended &&
        current.userId === session.userId &&
        current.generation === session.generation
      ) {
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
    window.addEventListener(ERROR_NOTEBOOK_UPDATED_EVENT, handleReload);
    window.addEventListener(LONG_TERM_MEMORY_UPDATED_EVENT, handleReload);

    return () => {
      active = false;
      requestVersion.current = Math.max(requestVersion.current, version) + 1;
      window.removeEventListener("studyai:study-updated", handleReload);
      window.removeEventListener("studyai:notes-updated", handleReload);
      window.removeEventListener("studyai:summaries-updated", handleReload);
      window.removeEventListener("studyai:extraction-updated", handleReload);
      window.removeEventListener("studyai:learning-updated", handleReload);
      window.removeEventListener(ERROR_NOTEBOOK_UPDATED_EVENT, handleReload);
      window.removeEventListener(LONG_TERM_MEMORY_UPDATED_EVENT, handleReload);
    };
  }, [auth.isLoading, auth.session?.user.id, studyId]);

  return context;
}
