"use client";

import { useCallback, useEffect, useState } from "react";
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

const STORAGE_KEY = "studyai:teacher-preferences:v1";
const AUDIO_LESSON_STORAGE_KEY = "studyai:teacher-audio-lesson-preferences:v1";
const AUDIO_LESSON_SESSION_KEY = "studyai:teacher-audio-lesson-session:v1";

function loadPreferences(): TeacherPreferences {
  if (typeof window === "undefined") return defaultTeacherPreferences;
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<TeacherPreferences> | null;
    return {
      level: teacherLevels.includes(stored?.level as TeacherPreferences["level"]) ? stored!.level! : defaultTeacherPreferences.level,
      method: teacherMethods.includes(stored?.method as TeacherPreferences["method"]) ? stored!.method! : defaultTeacherPreferences.method,
      summaryStyle: teacherSummaryStyles.includes(stored?.summaryStyle as TeacherPreferences["summaryStyle"]) ? stored!.summaryStyle! : defaultTeacherPreferences.summaryStyle,
    };
  } catch {
    return defaultTeacherPreferences;
  }
}

function loadAudioLessonPreferences(): TeacherAudioLessonPreferences {
  if (typeof window === "undefined") return defaultTeacherAudioLessonPreferences;
  try {
    const stored = JSON.parse(window.localStorage.getItem(AUDIO_LESSON_STORAGE_KEY) ?? "null") as Partial<TeacherAudioLessonPreferences> | null;
    return {
      level: teacherLevels.includes(stored?.level as TeacherAudioLessonPreferences["level"]) ? stored!.level! : defaultTeacherAudioLessonPreferences.level,
      method: teacherMethods.includes(stored?.method as TeacherAudioLessonPreferences["method"]) ? stored!.method! : defaultTeacherAudioLessonPreferences.method,
      summaryStyle: teacherSummaryStyles.includes(stored?.summaryStyle as TeacherAudioLessonPreferences["summaryStyle"]) ? stored!.summaryStyle! : defaultTeacherAudioLessonPreferences.summaryStyle,
      voice: stored?.voice ?? defaultTeacherAudioLessonPreferences.voice,
      rate: stored?.rate ?? defaultTeacherAudioLessonPreferences.rate,
      autoplay: stored?.autoplay ?? defaultTeacherAudioLessonPreferences.autoplay,
    };
  } catch {
    return defaultTeacherAudioLessonPreferences;
  }
}

function loadAudioLessonSession(): {
  sessionId: string;
  topic: string;
  plan: string[];
  currentStep: number;
  completedSteps: number[];
  exercises: { step: number; question: string; answer?: string; corrected: boolean }[];
  audioPreferences: TeacherAudioLessonPreferences;
  pedagogicalState: Record<string, unknown>;
} | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = JSON.parse(window.localStorage.getItem(AUDIO_LESSON_SESSION_KEY) ?? "null");
    return stored;
  } catch {
    return null;
  }
}

export function useTeacher() {
  const [mode, setMode] = useState<"tutor" | "teacher">("tutor");
  const [preferences, setPreferences] = useState<TeacherPreferences>(defaultTeacherPreferences);
  const [audioPreferences, setAudioPreferences] = useState<TeacherAudioLessonPreferences>(defaultTeacherAudioLessonPreferences);
  const [selection, setSelection] = useState<TeacherMaterialSelection | null>(null);
  const [audioLessonMode, setAudioLessonMode] = useState<"idle" | "active" | "paused">("idle");
  const [audioLessonSession, setAudioLessonSession] = useState<{
    sessionId: string;
    topic: string;
    plan: string[];
    currentStep: number;
    completedSteps: number[];
    exercises: { step: number; question: string; answer?: string; corrected: boolean }[];
    audioPreferences: TeacherAudioLessonPreferences;
    pedagogicalState: Record<string, unknown>;
  } | null>(null);

  useEffect(() => { setPreferences(loadPreferences()); }, []);
  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => { setAudioPreferences(loadAudioLessonPreferences()); }, []);
  useEffect(() => {
    window.localStorage.setItem(AUDIO_LESSON_STORAGE_KEY, JSON.stringify(audioPreferences));
  }, [audioPreferences]);

  useEffect(() => {
    const session = loadAudioLessonSession();
    if (session) {
      setAudioLessonSession(session);
      if (session.currentStep < session.plan.length) {
        setAudioLessonMode("active");
      }
    }
  }, []);

  useEffect(() => {
    if (audioLessonSession) {
      window.localStorage.setItem(AUDIO_LESSON_SESSION_KEY, JSON.stringify(audioLessonSession));
    }
  }, [audioLessonSession]);

  useEffect(() => {
    const handleSelection = (event: Event) => {
      const detail = (event as CustomEvent<TeacherMaterialSelection>).detail;
      if (detail?.text?.trim()) setSelection({ ...detail, text: detail.text.trim().slice(0, 4_000) });
    };
    window.addEventListener("studyai:material-selection", handleSelection);
    return () => window.removeEventListener("studyai:material-selection", handleSelection);
  }, []);

  const updatePreferences = useCallback((changes: Partial<TeacherPreferences>) => {
    setPreferences((current) => ({ ...current, ...changes }));
  }, []);

  const updateAudioPreferences = useCallback((changes: Partial<TeacherAudioLessonPreferences>) => {
    setAudioPreferences((current) => ({ ...current, ...changes }));
  }, []);

  const startAudioLesson = useCallback((topic: string, plan: string[]) => {
    const sessionId = crypto.randomUUID();
    const newSession = {
      sessionId,
      topic,
      plan,
      currentStep: 0,
      completedSteps: [],
      exercises: [],
      audioPreferences,
      pedagogicalState: {},
    };
    setAudioLessonSession(newSession);
    setAudioLessonMode("active");
  }, [audioPreferences]);

  const advanceAudioLessonStep = useCallback(() => {
    setAudioLessonSession((current) => {
      if (!current) return current;
      if (current.currentStep >= current.plan.length - 1) return current;
      return {
        ...current,
        currentStep: current.currentStep + 1,
        completedSteps: [...current.completedSteps, current.currentStep],
      };
    });
  }, []);

  const previousAudioLessonStep = useCallback(() => {
    setAudioLessonSession((current) => {
      if (!current || current.currentStep === 0) return current;
      return {
        ...current,
        currentStep: current.currentStep - 1,
      };
    });
  }, []);

  const repeatCurrentStep = useCallback(() => {
    // Trigger repeat - the audio player will handle this
    return true;
  }, []);

  const addExercise = useCallback((step: number, question: string) => {
    setAudioLessonSession((current) => {
      if (!current) return current;
      return {
        ...current,
        exercises: [...current.exercises, { step, question, corrected: false }],
      };
    });
  }, []);

  const markExerciseCorrected = useCallback((step: number, answer: string, corrected: boolean) => {
    setAudioLessonSession((current) => {
      if (!current) return current;
      return {
        ...current,
        exercises: current.exercises.map((ex) =>
          ex.step === step ? { ...ex, answer, corrected } : ex
        ),
      };
    });
  }, []);

  const pauseAudioLesson = useCallback(() => {
    setAudioLessonMode("paused");
  }, []);

  const resumeAudioLesson = useCallback(() => {
    setAudioLessonMode("active");
  }, []);

  const endAudioLesson = useCallback(() => {
    setAudioLessonMode("idle");
    setAudioLessonSession(null);
    window.localStorage.removeItem(AUDIO_LESSON_SESSION_KEY);
  }, []);

  const createRequest = useCallback((action: TeacherAction, context?: TutorStudyContext | null) => {
    const basePrefs = audioLessonMode === "active" ? audioPreferences : preferences;
    const teaching: TeacherRequest = {
      mode: "teacher",
      action,
      ...basePrefs,
      voice: audioPreferences.voice,
      rate: audioPreferences.rate,
      autoplay: audioPreferences.autoplay,
      selection: action === "explain_selection" ? selection ?? undefined : undefined,
    };
    return {
      content: TeacherPromptBuilder.actionMessage(action, context, basePrefs.summaryStyle),
      teaching,
    };
  }, [preferences, audioPreferences, audioLessonMode, selection]);

  return {
    mode,
    preferences,
    audioPreferences,
    selection,
    audioLessonMode,
    audioLessonSession,
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