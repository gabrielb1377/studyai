"use client";

import { useCallback, useEffect, useState } from "react";
import type { TutorStudyContext } from "@/types/tutor-context";
import { TeacherPromptBuilder } from "../TeacherPromptBuilder";
import {
  defaultTeacherPreferences,
  teacherLevels,
  teacherMethods,
  teacherSummaryStyles,
  type TeacherAction,
  type TeacherMaterialSelection,
  type TeacherPreferences,
  type TeacherRequest,
} from "../types";

const STORAGE_KEY = "studyai:teacher-preferences:v1";

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

export function useTeacher() {
  const [mode, setMode] = useState<"tutor" | "teacher">("tutor");
  const [preferences, setPreferences] = useState<TeacherPreferences>(defaultTeacherPreferences);
  const [selection, setSelection] = useState<TeacherMaterialSelection | null>(null);

  useEffect(() => { setPreferences(loadPreferences()); }, []);
  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);
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

  const createRequest = useCallback((action: TeacherAction, context?: TutorStudyContext | null) => {
    const teaching: TeacherRequest = {
      mode: "teacher",
      action,
      ...preferences,
      selection: action === "explain_selection" ? selection ?? undefined : undefined,
    };
    return {
      content: TeacherPromptBuilder.actionMessage(action, context, preferences.summaryStyle),
      teaching,
    };
  }, [preferences, selection]);

  return {
    mode,
    preferences,
    selection,
    setMode,
    updatePreferences,
    clearSelection: () => setSelection(null),
    createRequest,
  };
}
