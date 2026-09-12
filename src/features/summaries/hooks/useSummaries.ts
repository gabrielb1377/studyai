"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { StudySummary } from "@/types/summary";
import { SummaryService } from "../services/SummaryService";
import { SUMMARIES_UPDATE_EVENT, SummaryStorage } from "../services/SummaryStorage";

export function useSummaries(studyId?: string) {
  const [summaries, setSummaries] = useState<StudySummary[]>([]);
  const [isReady, setIsReady] = useState(false);

  const reload = useCallback(() => {
    setSummaries(SummaryStorage.load() ?? []);
    setIsReady(true);
  }, []);

  useEffect(() => {
    reload();
    window.addEventListener(SUMMARIES_UPDATE_EVENT, reload);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener(SUMMARIES_UPDATE_EVENT, reload);
      window.removeEventListener("storage", reload);
    };
  }, [reload]);

  const updateSummaries = (updater: (current: StudySummary[]) => StudySummary[]) => {
    setSummaries((current) => {
      const nextSummaries = updater(current);
      SummaryStorage.save(nextSummaries);
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
    saveSummary: (summary: StudySummary) => updateSummaries((current) => SummaryService.save(current, summary)),
    deleteSummary: (summaryId: string) => updateSummaries((current) => SummaryService.remove(current, summaryId)),
  };
}
