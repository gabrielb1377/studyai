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

  const refresh = useCallback(async () => {
    setRecords(await StudyEngine.load());
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const handleRefresh = () => { void refresh(); };
    window.addEventListener(STUDY_UPDATED_EVENT, handleRefresh);
    window.addEventListener("studyai:storage-updated", handleRefresh);
    return () => {
      window.removeEventListener(STUDY_UPDATED_EVENT, handleRefresh);
      window.removeEventListener("studyai:storage-updated", handleRefresh);
    };
  }, [refresh]);

  const update = useCallback(async (change: (records: StudyRecord[]) => StudyRecord[]) => {
    const next = change(await StudyEngine.load());
    await StudyEngine.save(next);
    setRecords(next);
    setIsLoading(false);
  }, []);

  const recordAccess = useCallback(
    (studyId: string) => { void update((items) => StudyEngine.recordAccess(items, studyId)); },
    [update],
  );
  const setProgress = useCallback(
    (studyId: string, progress: number) => { void update((items) => StudyEngine.setProgress(items, studyId, progress)); },
    [update],
  );
  const setStatus = useCallback(
    (studyId: string, status: StudyStatus) => { void update((items) => StudyEngine.setStatus(items, studyId, status)); },
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
