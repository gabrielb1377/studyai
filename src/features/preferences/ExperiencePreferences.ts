"use client";

import { useSyncExternalStore } from "react";
import { SessionOperationManager } from "@/features/account/SessionOperationManager";

export type ExperienceMode = "simple" | "advanced";
export type FontScale = "small" | "default" | "large" | "extra-large";
export type OnboardingProfile = {
  course: string;
  institution: string;
  semester: string;
  goal: "exams" | "competition" | "entrance" | "learn" | "other";
  language: "pt-BR" | "en";
  provider: "gemini" | "ollama" | "openrouter" | "groq";
};

export type ExperiencePreferences = {
  mode: ExperienceMode;
  compactDensity: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
  fontScale: FontScale;
  telemetryConsent: boolean;
  onboardingCompleted: boolean;
  onboardingProfile: OnboardingProfile;
  dismissedGuides: string[];
};

const STORAGE_KEY_PREFIX = "studyai:experience-settings:";
const EVENT = "studyai:experience-settings-changed";
const defaults: ExperiencePreferences = {
  mode: "simple",
  compactDensity: false,
  reducedMotion: false,
  highContrast: false,
  fontScale: "default",
  telemetryConsent: false,
  onboardingCompleted: false,
  onboardingProfile: { course: "", institution: "", semester: "", goal: "learn", language: "pt-BR", provider: "gemini" },
  dismissedGuides: [],
};

function storageKey(userId: string) {
  return `${STORAGE_KEY_PREFIX}${userId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function currentUserId(): string | null {
  if (typeof window === "undefined") return null;
  const session = SessionOperationManager.current();
  return session.userId ?? null;
}

let cache: ExperiencePreferences = defaults;
let serializedCache = "";
let cachedUserId: string | null = null;

function read() {
  if (typeof window === "undefined") return defaults;
  const userId = currentUserId();
  if (!userId) return defaults;
  const serialized = localStorage.getItem(storageKey(userId)) ?? "";
  if (serialized === serializedCache && cachedUserId === userId) return cache;
  try {
    cache = { ...defaults, ...JSON.parse(serialized) as Partial<ExperiencePreferences> };
  } catch {
    cache = defaults;
  }
  serializedCache = serialized;
  cachedUserId = userId;
  return cache;
}

function emit() {
  window.dispatchEvent(new Event(EVENT));
  window.dispatchEvent(new Event("studyai:workspace-updated"));
}

export const ExperiencePreferencesService = {
  get: read,
  invalidate() {
    cache = defaults;
    serializedCache = "";
    cachedUserId = null;
    if (typeof window !== "undefined") emit();
  },
  update(changes: Partial<ExperiencePreferences>) {
    const userId = currentUserId();
    if (!userId) return defaults;
    const next = { ...read(), ...changes };
    const serialized = JSON.stringify(next);
    localStorage.setItem(storageKey(userId), serialized);
    cache = next;
    serializedCache = serialized;
    cachedUserId = userId;
    emit();
    return next;
  },
  dismissGuide(id: string) {
    const current = read();
    if (current.dismissedGuides.includes(id)) return current;
    return this.update({ dismissedGuides: [...current.dismissedGuides, id] });
  },
  resetGuides() {
    return this.update({ dismissedGuides: [], onboardingCompleted: false });
  },
};

export function useExperiencePreferences() {
  return useSyncExternalStore(
    (listener) => {
      window.addEventListener(EVENT, listener);
      window.addEventListener("storage", listener);
      return () => {
        window.removeEventListener(EVENT, listener);
        window.removeEventListener("storage", listener);
      };
    },
    read,
    () => defaults,
  );
}
