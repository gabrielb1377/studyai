"use client";

import { useCallback, useEffect, useState } from "react";
import type { MentorSession, MentorSnapshot } from "../types";
import { GoalManager } from "../services/GoalManager";
import { MENTOR_UPDATED_EVENT, MentorStorage } from "../services/MentorStorage";
import { MentorService } from "../services/MentorService";

const empty: MentorSnapshot = { goals: [], sessions: [], recommendations: [], updatedAt: "" };

export function useMentor(studyId: string) {
  const [snapshot, setSnapshot] = useState<MentorSnapshot>(empty);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setSnapshot(await MentorStorage.load());
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const onUpdate = () => { void refresh(); };
    window.addEventListener(MENTOR_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(MENTOR_UPDATED_EVENT, onUpdate);
  }, [refresh]);

  const run = useCallback(async <T,>(operation: () => Promise<T>) => {
    setIsWorking(true);
    setError("");
    try {
      return await operation();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o Mentor.");
    } finally {
      setIsWorking(false);
    }
  }, []);

  const activeSession = snapshot.sessions.find((session) => session.studyId === studyId && session.status !== "completed")
    ?? snapshot.sessions.find((session) => session.studyId === studyId);

  return {
    snapshot,
    activeSession,
    isLoading,
    isWorking,
    error,
    startSession: () => run(() => MentorService.startSession(studyId)),
    answer: (session: MentorSession, answer: string) => run(() => MentorService.answer(session.id, answer)),
    setSessionStatus: (session: MentorSession, status: MentorSession["status"]) => run(() => MentorService.setStatus(session.id, status)),
    explain: (session: MentorSession) => run(() => MentorService.explain(session.id)),
    refreshRecommendations: () => run(() => MentorService.refreshRecommendations(studyId)),
    createGoal: (input: Parameters<typeof GoalManager.create>[0]) => run(() => GoalManager.create(input)),
    updateGoal: (id: string, changes: Parameters<typeof GoalManager.update>[1]) => run(() => GoalManager.update(id, changes)),
    removeGoal: (id: string) => run(() => GoalManager.remove(id)),
  };
}
