"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { StudySummary } from "@/types/summary";
import { SummaryService } from "../services/SummaryService";
import { SUMMARIES_UPDATE_EVENT, SummaryStorage } from "../services/SummaryStorage";
import { LearningService } from "@/features/learning/LearningService";

export function useSummaries(studyId?: string) {
  const [summaries, setSummaries] = useState<StudySummary[]>([]);
  const [isReady, setIsReady] = useState(false);

  const reload = useCallback(async () => {
    setSummaries((await SummaryStorage.load()) ?? []);
    setIsReady(true);
  }, []);

  useEffect(() => {
    void reload();
    const handleReload = () => { void reload(); };
    window.addEventListener(SUMMARIES_UPDATE_EVENT, handleReload);
    window.addEventListener("studyai:storage-updated", handleReload);
    return () => {
      window.removeEventListener(SUMMARIES_UPDATE_EVENT, handleReload);
      window.removeEventListener("studyai:storage-updated", handleReload);
    };
  }, [reload]);

  const updateSummaries = (updater: (current: StudySummary[]) => StudySummary[]) => {
    setSummaries((current) => {
      const nextSummaries = updater(current);
      void SummaryStorage.save(nextSummaries);
      return nextSummaries;
    });
  };
  const visibleSummaries = useMemo(
    () => studyId ? summaries.filter((summary) => summary.studyId === studyId) : summaries,
    [studyId, summaries],
  );

  return {
    summaries: visibleSummaries,
    isReady,
    saveSummary: (summary: StudySummary) => {
      const isNew = !summaries.some((item) => item.id === summary.id);
      updateSummaries((current) => SummaryService.save(current, summary));
      if (isNew && summary.studyId) LearningService.enqueueActivity({ type: "summary", studyId: summary.studyId });
    },
    deleteSummary: (summaryId: string) => updateSummaries((current) => SummaryService.remove(current, summaryId)),
  };
}
