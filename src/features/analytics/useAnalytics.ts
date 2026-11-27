"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { MentorStorage, MENTOR_UPDATED_EVENT } from "@/features/mentor/services/MentorStorage";
import { currentDatabaseGeneration } from "@/lib/storage/Database";
import { STORAGE_UPDATED_EVENT } from "@/lib/storage/StorageManager";
import { AnalyticsEngine } from "./AnalyticsEngine";
import type { AnalyticsInput, AnalyticsSnapshot } from "./types";

export function useAnalytics(input: Omit<AnalyticsInput, "mentorSessions">) {
  const [snapshot, setSnapshot] = useState<AnalyticsSnapshot>();
  const [mentorSessions, setMentorSessions] = useState<AnalyticsInput["mentorSessions"]>([]);
  const [scopeVersion, setScopeVersion] = useState(0);
  const scopeSeqRef = useRef(0);

  useEffect(() => {
    let unmounted = false;
    const load = async () => {
      const capturedSeq = scopeSeqRef.current;
      const capturedDbGen = currentDatabaseGeneration();
      const mentor = await MentorStorage.load();
      // Descarta respostas assíncronas tardias caso a conta/escopo tenha mudado em voo
      if (
        !unmounted &&
        scopeSeqRef.current === capturedSeq &&
        currentDatabaseGeneration() === capturedDbGen
      ) {
        setMentorSessions(mentor.sessions);
      }
    };
    const handleStorageUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ scopeChanged?: boolean }>).detail;
      if (detail?.scopeChanged) {
        scopeSeqRef.current += 1;
        AnalyticsEngine.clearCache();
        setSnapshot(undefined);
        setMentorSessions([]);
        setScopeVersion((v) => v + 1);
        void load();
      }
    };
    void load();
    window.addEventListener(MENTOR_UPDATED_EVENT, load);
    window.addEventListener(STORAGE_UPDATED_EVENT, handleStorageUpdate);
    return () => {
      unmounted = true;
      window.removeEventListener(MENTOR_UPDATED_EVENT, load);
      window.removeEventListener(STORAGE_UPDATED_EVENT, handleStorageUpdate);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const capturedSeq = scopeSeqRef.current;
    const capturedDbGen = currentDatabaseGeneration();
    const calculate = () => {
      if (
        cancelled ||
        scopeSeqRef.current !== capturedSeq ||
        currentDatabaseGeneration() !== capturedDbGen
      ) {
        return;
      }
      const next = AnalyticsEngine.build({ ...input, mentorSessions });
      if (
        !cancelled &&
        scopeSeqRef.current === capturedSeq &&
        currentDatabaseGeneration() === capturedDbGen
      ) {
        startTransition(() => setSnapshot(next));
      }
    };
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(calculate, { timeout: 600 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(id);
      };
    }
    const id = globalThis.setTimeout(calculate, 0);
    return () => {
      cancelled = true;
      globalThis.clearTimeout(id);
    };
  }, [input, mentorSessions, scopeVersion]);

  return { snapshot, isLoading: !snapshot };
}
