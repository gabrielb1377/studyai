"use client";

import { useEffect, useState } from "react";
import type { TutorStudyContext } from "@/types/tutor-context";
import { TutorContextService } from "../services/TutorContextService";

export function useTutorContext() {
  const [context, setContext] = useState<TutorStudyContext | null>(null);

  useEffect(() => {
    const reload = async () => setContext(await TutorContextService.loadCurrent());
    const handleReload = () => { void reload(); };
    void reload();
    window.addEventListener("studyai:study-updated", handleReload);
    window.addEventListener("studyai:notes-updated", handleReload);
    window.addEventListener("studyai:summaries-updated", handleReload);
    window.addEventListener("studyai:extraction-updated", handleReload);

    return () => {
      window.removeEventListener("studyai:study-updated", handleReload);
      window.removeEventListener("studyai:notes-updated", handleReload);
      window.removeEventListener("studyai:summaries-updated", handleReload);
      window.removeEventListener("studyai:extraction-updated", handleReload);
    };
  }, []);

  return context;
}
