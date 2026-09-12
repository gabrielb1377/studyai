"use client";

import { useCallback, useEffect, useState } from "react";

import {
  STUDY_UPDATED_EVENT,
  StudyEngine,
} from "@/features/study/services/StudyEngine";
import type { StudyStatus } from "@/types/study-engine";
import type { StudyRecord } from "@/types/study-engine";

export function useStudyEngine() {
  const [records, setRecords] = useState<StudyRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(() => {
    setRecords(StudyEngine.load());
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(STUDY_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(STUDY_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [refresh]);

  const update = useCallback((change: (records: ReturnType<typeof StudyEngine.load>) => ReturnType<typeof StudyEngine.load>) => {
    const next = change(StudyEngine.load());
    StudyEngine.save(next);
    setRecords(next);
    setIsLoading(false);
  }, []);

  const recordAccess = useCallback(
    (studyId: string) => update((items) => StudyEngine.recordAccess(items, studyId)),
    [update],
  );
  const setProgress = useCallback(
    (studyId: string, progress: number) => update((items) => StudyEngine.setProgress(items, studyId, progress)),
    [update],
  );
  const setStatus = useCallback(
    (studyId: string, status: StudyStatus) => update((items) => StudyEngine.setStatus(items, studyId, status)),
    [update],
  );

  return {
    records,
    isLoading,
    refresh,
    recordAccess,
    setProgress,
    setStatus,
  };
}
