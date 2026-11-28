"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/features/account/AuthProvider";
import { SessionOperationManager } from "@/features/account/SessionOperationManager";
import type { TutorStudyContext } from "@/types/tutor-context";
import { TeacherPromptBuilder } from "../TeacherPromptBuilder";
import {
  defaultTeacherPreferences,
  defaultTeacherAudioLessonPreferences,
  teacherLevels,
  teacherMethods,
  teacherSummaryStyles,
  type TeacherAction,
  type TeacherMaterialSelection,
  type TeacherPreferences,
  type TeacherRequest,
  type TeacherAudioLessonPreferences,
} from "../types";

export const TEACHER_PREFERENCES_KEY_PREFIX = "studyai:teacher-preferences:v2:";
export const TEACHER_AUDIO_PREFERENCES_KEY_PREFIX = "studyai:teacher-audio-lesson-preferences:v2:";
export const TEACHER_AUDIO_SESSION_KEY_PREFIX = "studyai:teacher-audio-lesson-session:v2:";

export type TeacherAudioLessonSessionState = {
  sessionId: string;
  ownerId: string;
  topic: string;
  plan: string[];
  currentStep: number;
  completedSteps: number[];
  exercises: { step: number; question: string; answer?: string; corrected: boolean }[];
  audioPreferences: TeacherAudioLessonPreferences;
  pedagogicalState: Record<string, unknown>;
};

type ActiveSessionIdentity = {
  readonly ownerId: string;
  readonly generation: number;
};

function sanitizeOwnerSegment(ownerId: string): string {
  return ownerId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function teacherPreferencesKey(ownerId: string): string {
  return `${TEACHER_PREFERENCES_KEY_PREFIX}${sanitizeOwnerSegment(ownerId)}`;
}

export function teacherAudioPreferencesKey(ownerId: string): string {
  return `${TEACHER_AUDIO_PREFERENCES_KEY_PREFIX}${sanitizeOwnerSegment(ownerId)}`;
}

export function teacherAudioSessionKey(ownerId: string): string {
  return `${TEACHER_AUDIO_SESSION_KEY_PREFIX}${sanitizeOwnerSegment(ownerId)}`;
}

function resolveActiveSession(
  authLoading: boolean,
  authUserId?: string,
): ActiveSessionIdentity | null {
  if (typeof window === "undefined" || authLoading) return null;
  const runtime = SessionOperationManager.current();
  if (runtime.suspended || !runtime.userId) return null;
  if (authUserId && runtime.userId !== authUserId) return null;
  return { ownerId: runtime.userId, generation: runtime.generation };
}

function isSessionStillCurrent(expected: ActiveSessionIdentity | null): expected is ActiveSessionIdentity {
  if (!expected || typeof window === "undefined") return false;
  const current = SessionOperationManager.current();
  return !current.suspended && current.userId === expected.ownerId && current.generation === expected.generation;
}

function safeWriteScopedJson(
  expected: ActiveSessionIdentity | null,
  key: string,
  value: unknown,
): boolean {
  if (!isSessionStillCurrent(expected)) return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function safeRemoveScopedItem(
  expected: ActiveSessionIdentity | null,
  key: string,
): boolean {
  if (!isSessionStillCurrent(expected)) return false;
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function loadPreferencesForOwner(ownerId: string): TeacherPreferences {
  if (typeof window === "undefined") return defaultTeacherPreferences;
  try {
    // Nunca lê nem migra automaticamente a chave global legada `studyai:teacher-preferences:v1`.
    const stored = JSON.parse(
      window.localStorage.getItem(teacherPreferencesKey(ownerId)) ?? "null",
    ) as Partial<TeacherPreferences> | null;
    if (!stored || typeof stored !== "object") return defaultTeacherPreferences;
    return {
      level: teacherLevels.includes(stored.level as TeacherPreferences["level"])
        ? stored.level!
        : defaultTeacherPreferences.level,
      method: teacherMethods.includes(stored.method as TeacherPreferences["method"])
        ? stored.method!
        : defaultTeacherPreferences.method,
      summaryStyle: teacherSummaryStyles.includes(stored.summaryStyle as TeacherPreferences["summaryStyle"])
        ? stored.summaryStyle!
        : defaultTeacherPreferences.summaryStyle,
    };
  } catch {
    return defaultTeacherPreferences;
  }
}

function loadAudioLessonPreferencesForOwner(ownerId: string): TeacherAudioLessonPreferences {
  if (typeof window === "undefined") return defaultTeacherAudioLessonPreferences;
  try {
    // Nunca lê nem migra automaticamente a chave global legada `studyai:teacher-audio-lesson-preferences:v1`.
    const stored = JSON.parse(
      window.localStorage.getItem(teacherAudioPreferencesKey(ownerId)) ?? "null",
    ) as Partial<TeacherAudioLessonPreferences> | null;
    if (!stored || typeof stored !== "object") return defaultTeacherAudioLessonPreferences;
    return {
      level: teacherLevels.includes(stored.level as TeacherAudioLessonPreferences["level"])
        ? stored.level!
        : defaultTeacherAudioLessonPreferences.level,
      method: teacherMethods.includes(stored.method as TeacherAudioLessonPreferences["method"])
        ? stored.method!
        : defaultTeacherAudioLessonPreferences.method,
      summaryStyle: teacherSummaryStyles.includes(stored.summaryStyle as TeacherAudioLessonPreferences["summaryStyle"])
        ? stored.summaryStyle!
        : defaultTeacherAudioLessonPreferences.summaryStyle,
      voice: typeof stored.voice === "string" ? stored.voice : defaultTeacherAudioLessonPreferences.voice,
      rate:
        stored.rate === 0.75 || stored.rate === 1 || stored.rate === 1.25 || stored.rate === 1.5
          ? stored.rate
          : defaultTeacherAudioLessonPreferences.rate,
      autoplay: typeof stored.autoplay === "boolean" ? stored.autoplay : defaultTeacherAudioLessonPreferences.autoplay,
    };
  } catch {
    return defaultTeacherAudioLessonPreferences;
  }
}

function loadAudioLessonSessionForOwner(ownerId: string): TeacherAudioLessonSessionState | null {
  if (typeof window === "undefined") return null;
  try {
    // Nunca lê nem migra automaticamente a chave global legada `studyai:teacher-audio-lesson-session:v1`.
    const stored = JSON.parse(
      window.localStorage.getItem(teacherAudioSessionKey(ownerId)) ?? "null",
    ) as Partial<TeacherAudioLessonSessionState> | null;
    if (
      !stored ||
      typeof stored !== "object" ||
      stored.ownerId !== ownerId ||
      typeof stored.sessionId !== "string" ||
      typeof stored.topic !== "string" ||
      !Array.isArray(stored.plan) ||
      typeof stored.currentStep !== "number"
    ) {
      return null;
    }
    return {
      sessionId: stored.sessionId,
      ownerId,
      topic: stored.topic,
      plan: stored.plan.filter((item): item is string => typeof item === "string"),
      currentStep: Math.max(0, Math.trunc(stored.currentStep)),
      completedSteps: Array.isArray(stored.completedSteps)
        ? stored.completedSteps.filter((step): step is number => typeof step === "number")
        : [],
      exercises: Array.isArray(stored.exercises) ? stored.exercises : [],
      audioPreferences: stored.audioPreferences ?? defaultTeacherAudioLessonPreferences,
      pedagogicalState:
        stored.pedagogicalState && typeof stored.pedagogicalState === "object"
          ? stored.pedagogicalState
          : {},
    };
  } catch {
    return null;
  }
}

export function useTeacher() {
  const auth = useAuth();
  const activeSession = resolveActiveSession(auth.isLoading, auth.session?.user.id);
  const activeSessionKey = activeSession
    ? `${activeSession.ownerId}:${activeSession.generation}`
    : null;

  const [mode, setMode] = useState<"tutor" | "teacher">("tutor");
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<TeacherPreferences>(defaultTeacherPreferences);
  const [audioPreferences, setAudioPreferences] = useState<TeacherAudioLessonPreferences>(
    defaultTeacherAudioLessonPreferences,
  );
  const [selection, setSelection] = useState<TeacherMaterialSelection | null>(null);
  const [exerciseStage, setExerciseStage] = useState(1);
  const [audioLessonMode, setAudioLessonMode] = useState<"idle" | "active" | "paused">("idle");
  const [audioLessonSession, setAudioLessonSession] = useState<TeacherAudioLessonSessionState | null>(null);

  const activeSessionRef = useRef<ActiveSessionIdentity | null>(activeSession);
  activeSessionRef.current = activeSession;

  // Hidratação segura vinculada à identidade e geração da sessão.
  // Limpa imediatamente o estado em memória no logout/transição e nunca grava defaults no mount.
  useEffect(() => {
    if (!activeSession || !activeSessionKey) {
      setHydratedKey(null);
      setPreferences(defaultTeacherPreferences);
      setAudioPreferences(defaultTeacherAudioLessonPreferences);
      setSelection(null);
      setExerciseStage(1);
      setAudioLessonMode("idle");
      setAudioLessonSession(null);
      return;
    }

    if (!isSessionStillCurrent(activeSession)) return;

    const loadedPreferences = loadPreferencesForOwner(activeSession.ownerId);
    const loadedAudioPreferences = loadAudioLessonPreferencesForOwner(activeSession.ownerId);
    const loadedAudioSession = loadAudioLessonSessionForOwner(activeSession.ownerId);

    setPreferences(loadedPreferences);
    setAudioPreferences(loadedAudioPreferences);
    setSelection(null);
    setExerciseStage(1);
    setAudioLessonSession(loadedAudioSession);
    setAudioLessonMode(
      loadedAudioSession && loadedAudioSession.currentStep < loadedAudioSession.plan.length
        ? "active"
        : "idle",
    );
    setHydratedKey(activeSessionKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionKey]);

  useEffect(() => {
    const handleSelection = (event: Event) => {
      if (!isSessionStillCurrent(activeSessionRef.current)) return;
      const detail = (event as CustomEvent<TeacherMaterialSelection>).detail;
      if (detail?.text?.trim()) setSelection({ ...detail, text: detail.text.trim().slice(0, 4_000) });
    };
    window.addEventListener("studyai:material-selection", handleSelection);
    return () => window.removeEventListener("studyai:material-selection", handleSelection);
  }, []);

  const isCurrentHydrated = activeSessionKey !== null && hydratedKey === activeSessionKey;
  const effectivePreferences = isCurrentHydrated ? preferences : defaultTeacherPreferences;
  const effectiveAudioPreferences = isCurrentHydrated
    ? audioPreferences
    : defaultTeacherAudioLessonPreferences;
  const effectiveSelection = isCurrentHydrated ? selection : null;
  const effectiveAudioLessonMode = isCurrentHydrated ? audioLessonMode : "idle";
  const effectiveAudioLessonSession =
    isCurrentHydrated && audioLessonSession?.ownerId === activeSession?.ownerId
      ? audioLessonSession
      : null;

  const updatePreferences = useCallback((changes: Partial<TeacherPreferences>) => {
    const session = activeSessionRef.current;
    if (!isSessionStillCurrent(session)) return;
    setPreferences((current) => {
      const next: TeacherPreferences = {
        level: teacherLevels.includes(changes.level as TeacherPreferences["level"])
          ? changes.level!
          : current.level,
        method: teacherMethods.includes(changes.method as TeacherPreferences["method"])
          ? changes.method!
          : current.method,
        summaryStyle: teacherSummaryStyles.includes(changes.summaryStyle as TeacherPreferences["summaryStyle"])
          ? changes.summaryStyle!
          : current.summaryStyle,
      };
      safeWriteScopedJson(session, teacherPreferencesKey(session.ownerId), next);
      return next;
    });
  }, []);

  const updateAudioPreferences = useCallback((changes: Partial<TeacherAudioLessonPreferences>) => {
    const session = activeSessionRef.current;
    if (!isSessionStillCurrent(session)) return;
    setAudioPreferences((current) => {
      const next: TeacherAudioLessonPreferences = {
        ...current,
        ...changes,
      };
      safeWriteScopedJson(session, teacherAudioPreferencesKey(session.ownerId), next);
      return next;
    });
  }, []);

  const startAudioLesson = useCallback((topic: string, plan: string[]) => {
    const session = activeSessionRef.current;
    if (!isSessionStillCurrent(session)) return;
    const sessionId = crypto.randomUUID();
    const newSession: TeacherAudioLessonSessionState = {
      sessionId,
      ownerId: session.ownerId,
      topic,
      plan,
      currentStep: 0,
      completedSteps: [],
      exercises: [],
      audioPreferences: effectiveAudioPreferences,
      pedagogicalState: {},
    };
    safeWriteScopedJson(session, teacherAudioSessionKey(session.ownerId), newSession);
    setAudioLessonSession(newSession);
    setAudioLessonMode("active");
  }, [effectiveAudioPreferences]);

  const advanceAudioLessonStep = useCallback(() => {
    const session = activeSessionRef.current;
    if (!isSessionStillCurrent(session)) return;
    setAudioLessonSession((current) => {
      if (!current || current.ownerId !== session.ownerId) return current;
      if (current.currentStep >= current.plan.length - 1) return current;
      const next: TeacherAudioLessonSessionState = {
        ...current,
        currentStep: current.currentStep + 1,
        completedSteps: [...current.completedSteps, current.currentStep],
      };
      safeWriteScopedJson(session, teacherAudioSessionKey(session.ownerId), next);
      return next;
    });
  }, []);

  const previousAudioLessonStep = useCallback(() => {
    const session = activeSessionRef.current;
    if (!isSessionStillCurrent(session)) return;
    setAudioLessonSession((current) => {
      if (!current || current.ownerId !== session.ownerId || current.currentStep === 0) return current;
      const next: TeacherAudioLessonSessionState = {
        ...current,
        currentStep: current.currentStep - 1,
      };
      safeWriteScopedJson(session, teacherAudioSessionKey(session.ownerId), next);
      return next;
    });
  }, []);

  const repeatCurrentStep = useCallback(() => {
    return true;
  }, []);

  const addExercise = useCallback((step: number, question: string) => {
    const session = activeSessionRef.current;
    if (!isSessionStillCurrent(session)) return;
    setAudioLessonSession((current) => {
      if (!current || current.ownerId !== session.ownerId) return current;
      const next: TeacherAudioLessonSessionState = {
        ...current,
        exercises: [...current.exercises, { step, question, corrected: false }],
      };
      safeWriteScopedJson(session, teacherAudioSessionKey(session.ownerId), next);
      return next;
    });
  }, []);

  const markExerciseCorrected = useCallback((step: number, answer: string, corrected: boolean) => {
    const session = activeSessionRef.current;
    if (!isSessionStillCurrent(session)) return;
    setAudioLessonSession((current) => {
      if (!current || current.ownerId !== session.ownerId) return current;
      const next: TeacherAudioLessonSessionState = {
        ...current,
        exercises: current.exercises.map((ex) =>
          ex.step === step ? { ...ex, answer, corrected } : ex,
        ),
      };
      safeWriteScopedJson(session, teacherAudioSessionKey(session.ownerId), next);
      return next;
    });
  }, []);

  const pauseAudioLesson = useCallback(() => {
    if (!isSessionStillCurrent(activeSessionRef.current)) return;
    setAudioLessonMode("paused");
  }, []);

  const resumeAudioLesson = useCallback(() => {
    if (!isSessionStillCurrent(activeSessionRef.current)) return;
    setAudioLessonMode("active");
  }, []);

  const endAudioLesson = useCallback(() => {
    const session = activeSessionRef.current;
    setAudioLessonMode("idle");
    setAudioLessonSession(null);
    if (session) {
      safeRemoveScopedItem(session, teacherAudioSessionKey(session.ownerId));
    }
  }, []);

  const createRequest = useCallback((action: TeacherAction, context?: TutorStudyContext | null) => {
    const basePrefs = effectiveAudioLessonMode === "active" ? effectiveAudioPreferences : effectivePreferences;
    const stage = action === "exercise" ? exerciseStage : undefined;
    if (action === "exercise") {
      setExerciseStage((current) => Math.min(current + 1, 20));
    }
    const teaching: TeacherRequest = {
      mode: "teacher",
      action,
      ...basePrefs,
      voice: effectiveAudioPreferences.voice,
      rate: effectiveAudioPreferences.rate,
      autoplay: effectiveAudioPreferences.autoplay,
      selection: action === "explain_selection" ? effectiveSelection ?? undefined : undefined,
      ...(stage ? { exerciseStage: stage } : {}),
    };
    return {
      content: TeacherPromptBuilder.actionMessage(action, context, basePrefs.summaryStyle, stage),
      teaching,
    };
  }, [effectivePreferences, effectiveAudioPreferences, effectiveAudioLessonMode, effectiveSelection, exerciseStage]);

  return {
    mode,
    preferences: effectivePreferences,
    audioPreferences: effectiveAudioPreferences,
    selection: effectiveSelection,
    audioLessonMode: effectiveAudioLessonMode,
    audioLessonSession: effectiveAudioLessonSession,
    setMode,
    updatePreferences,
    updateAudioPreferences,
    clearSelection: () => setSelection(null),
    createRequest,
    startAudioLesson,
    advanceAudioLessonStep,
    previousAudioLessonStep,
    repeatCurrentStep,
    addExercise,
    markExerciseCorrected,
    pauseAudioLesson,
    resumeAudioLesson,
    endAudioLesson,
  };
}
