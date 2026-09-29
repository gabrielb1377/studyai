"use client";

import { useEffect } from "react";
import { LearningService } from "@/features/learning/LearningService";
import { AcademyService } from "../services/AcademyService";
import { AcademyStorage } from "../storage/AcademyStorage";

export function useAcademyLearningTracker({
  studyId,
  chapter,
  active,
}: {
  studyId: string;
  chapter: string;
  active: boolean;
}) {
  useEffect(() => {
    if (!active) return;
    const startedAt = Date.now();
    void AcademyService.beginContent(studyId).catch(() => undefined);

    return () => {
      AcademyStorage.emitUpdate();
      const durationMinutes = (Date.now() - startedAt) / 60_000;
      if (durationMinutes < 1 / 60) return;
      void LearningService.recordActivity({
        type: "reading",
        studyId,
        chapter,
        durationMinutes,
      });
    };
  }, [active, chapter, studyId]);
}
