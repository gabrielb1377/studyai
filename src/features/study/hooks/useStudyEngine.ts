"use client";

import { useCallback, useEffect, useState } from "react";
import type { Topic } from "@/types/study";
import type { StudyRecord, StudyStatus } from "@/types/study-engine";
import { StudyEngine } from "../services/StudyEngine";

export function useStudyEngine() {
  const [records, setRecords] = useState<StudyRecord[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setRecords(StudyEngine.load());
    setIsReady(true);
  }, []);

  const updateRecords = useCallback((updater: (current: StudyRecord[]) => StudyRecord[]) => {
    setRecords((current) => {
      const nextRecords = updater(current);
      StudyEngine.save(nextRecords);
      return nextRecords;
    });
  }, []);

  const ensureTopics = useCallback((topics: readonly Topic[]) => {
    updateRecords((current) => StudyEngine.ensureTopics(current, topics));
  }, [updateRecords]);

  const recordAccess = useCallback((topic: Topic) => {
    updateRecords((current) => StudyEngine.recordAccess(current, topic));
  }, [updateRecords]);

  return {
    records,
    isReady,
    ensureTopics,
    recordAccess,
    setProgress: (studyId: string, progress: number) => updateRecords((current) => StudyEngine.setProgress(current, studyId, progress)),
    setStatus: (studyId: string, status: StudyStatus) => updateRecords((current) => StudyEngine.setStatus(current, studyId, status)),
  };
}
