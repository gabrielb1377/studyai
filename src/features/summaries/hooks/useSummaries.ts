"use client";

import { useEffect, useState } from "react";
import type { StudySummary } from "@/types/summary";
import { SummaryService } from "../services/SummaryService";
import { SummaryStorage } from "../services/SummaryStorage";

export function useSummaries() {
  const [summaries, setSummaries] = useState<StudySummary[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setSummaries(SummaryStorage.load() ?? []);
    setIsReady(true);
  }, []);

  const updateSummaries = (updater: (current: StudySummary[]) => StudySummary[]) => {
    setSummaries((current) => {
      const nextSummaries = updater(current);
      SummaryStorage.save(nextSummaries);
      return nextSummaries;
    });
  };

  return {
    summaries,
    isReady,
    saveSummary: (summary: StudySummary) => updateSummaries((current) => SummaryService.save(current, summary)),
    deleteSummary: (summaryId: string) => updateSummaries((current) => SummaryService.remove(current, summaryId)),
  };
}
