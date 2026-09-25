"use client";

import { startTransition, useEffect, useState } from "react";
import type { AnalyticsInput, AnalyticsSnapshot } from "./types";
import { AnalyticsEngine } from "./AnalyticsEngine";
import { MentorStorage, MENTOR_UPDATED_EVENT } from "@/features/mentor/services/MentorStorage";

export function useAnalytics(input: Omit<AnalyticsInput, "mentorSessions">) {
  const [snapshot, setSnapshot] = useState<AnalyticsSnapshot>();
  const [mentorSessions, setMentorSessions] = useState<AnalyticsInput["mentorSessions"]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const mentor = await MentorStorage.load();
      if (!cancelled) setMentorSessions(mentor.sessions);
    };
    void load();
    window.addEventListener(MENTOR_UPDATED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(MENTOR_UPDATED_EVENT, load);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const calculate = () => {
      const next = AnalyticsEngine.build({ ...input, mentorSessions });
      if (!cancelled) startTransition(() => setSnapshot(next));
    };
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(calculate, { timeout: 600 });
      return () => { cancelled = true; window.cancelIdleCallback(id); };
    }
    const id = globalThis.setTimeout(calculate, 0);
    return () => { cancelled = true; globalThis.clearTimeout(id); };
  }, [input, mentorSessions]);

  return { snapshot, isLoading: !snapshot };
}
