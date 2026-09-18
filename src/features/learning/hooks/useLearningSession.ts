"use client";

import { useEffect } from "react";
import { LearningService } from "../LearningService";

export function useLearningSession(studyId?: string) {
  useEffect(() => {
    if (!studyId) return;
    let startedAt = Date.now();
    const flush = () => {
      const elapsed = Date.now() - startedAt;
      startedAt = Date.now();
      if (elapsed < 5_000) return;
      LearningService.enqueueActivity({ type: "reading", studyId, durationMinutes: elapsed / 60_000 });
    };
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") flush();
      else startedAt = Date.now();
    };
    const interval = window.setInterval(flush, 60_000);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
      flush();
    };
  }, [studyId]);
}
