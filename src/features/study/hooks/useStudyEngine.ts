"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  STUDY_UPDATED_EVENT,
  StudyEngine,
} from "@/features/study/services/StudyEngine";
import type { StudyStatus } from "@/types/study-engine";
import type { StudyRecord } from "@/types/study-engine";
import { SessionOperationManager } from "@/features/account/SessionOperationManager";

export function useStudyEngine() {
  const [records, setRecords] = useState<StudyRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const requestVersion = useRef(0);
  const updateQueue = useRef<Promise<void>>(Promise.resolve());

  const refresh = useCallback(async (options: { clear?: boolean } = {}) => {
    const version = ++requestVersion.current;
    if (options.clear) setRecords([]);
    setError(null);
    if (options.clear) setIsLoading(true);
    try {
      const loaded = await StudyEngine.load();
      if (version !== requestVersion.current) return;
      setRecords(loaded);
    } catch (cause) {
      if (version !== requestVersion.current) return;
      setRecords([]);
      setError(cause instanceof Error ? cause : new Error("Não foi possível carregar os estudos."));
    } finally {
      if (version === requestVersion.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh({ clear: true });
    const handleRefresh = () => { void refresh(); };
    const handleStorageRefresh = (event: Event) => {
      const scopeChanged = event instanceof CustomEvent && Boolean(event.detail?.scopeChanged);
      void refresh({ clear: scopeChanged });
    };
    window.addEventListener(STUDY_UPDATED_EVENT, handleRefresh);
    window.addEventListener("studyai:storage-updated", handleStorageRefresh);
    return () => {
      requestVersion.current += 1;
      window.removeEventListener(STUDY_UPDATED_EVENT, handleRefresh);
      window.removeEventListener("studyai:storage-updated", handleStorageRefresh);
    };
  }, [refresh]);

  const update = useCallback(async (change: (records: StudyRecord[]) => StudyRecord[]) => {
    const queued = updateQueue.current.catch(() => undefined).then(async () => {
      const operation = SessionOperationManager.start();
      try {
        const next = change(await StudyEngine.load());
        operation.assertCurrent();
        await StudyEngine.save(next);
        operation.assertCurrent();
        setRecords(next);
        setError(null);
        setIsLoading(false);
      } finally {
        operation.release();
      }
    });
    updateQueue.current = queued;
    await queued;
  }, []);

  const recordAccess = useCallback(
    (studyId: string) => { void update((items) => StudyEngine.recordAccess(items, studyId)).catch(() => undefined); },
    [update],
  );
  const setProgress = useCallback(
    (studyId: string, progress: number) => { void update((items) => StudyEngine.setProgress(items, studyId, progress)).catch(() => undefined); },
    [update],
  );
  const setStatus = useCallback(
    (studyId: string, status: StudyStatus) => { void update((items) => StudyEngine.setStatus(items, studyId, status)).catch(() => undefined); },
    [update],
  );

  return {
    records,
    isLoading,
    error,
    refresh,
    recordAccess,
    setProgress,
    setStatus,
  };
}
