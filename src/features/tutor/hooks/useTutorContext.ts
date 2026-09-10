"use client";

import { useEffect, useState } from "react";
import type { TutorStudyContext } from "@/types/tutor-context";
import { TutorContextService } from "../services/TutorContextService";

export function useTutorContext() {
  const [context, setContext] = useState<TutorStudyContext | null>(null);

  useEffect(() => {
    const reload = () => setContext(TutorContextService.loadCurrent());
    reload();
    window.addEventListener("studyai:notes-updated", reload);
    window.addEventListener("studyai:summaries-updated", reload);

    return () => {
      window.removeEventListener("studyai:notes-updated", reload);
      window.removeEventListener("studyai:summaries-updated", reload);
    };
  }, []);

  return context;
}
