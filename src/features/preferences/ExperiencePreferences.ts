"use client";

import { useSyncExternalStore } from "react";

export type ExperienceMode = "simple" | "advanced";
export type FontScale = "small" | "default" | "large" | "extra-large";

export type ExperiencePreferences = {
  mode: ExperienceMode;
  compactDensity: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
  fontScale: FontScale;
  telemetryConsent: boolean;
  onboardingCompleted: boolean;
  dismissedGuides: string[];
};

const STORAGE_KEY = "studyai:experience-settings";
const EVENT = "studyai:experience-settings-changed";
const defaults: ExperiencePreferences = {
  mode: "simple",
  compactDensity: false,
  reducedMotion: false,
  highContrast: false,
  fontScale: "default",
  telemetryConsent: false,
  onboardingCompleted: false,
  dismissedGuides: [],
};

let cache: ExperiencePreferences = defaults;
let serializedCache = "";

function read() {
  if (typeof localStorage === "undefined") return defaults;
  const serialized = localStorage.getItem(STORAGE_KEY) ?? "";
  if (serialized === serializedCache) return cache;
  try {
    cache = { ...defaults, ...JSON.parse(serialized) as Partial<ExperiencePreferences> };
  } catch {
    cache = defaults;
  }
  serializedCache = serialized;
  return cache;
}

function emit() {
  window.dispatchEvent(new Event(EVENT));
  window.dispatchEvent(new Event("studyai:workspace-updated"));
}

export const ExperiencePreferencesService = {
  get: read,
  update(changes: Partial<ExperiencePreferences>) {
    const next = { ...read(), ...changes };
    const serialized = JSON.stringify(next);
    localStorage.setItem(STORAGE_KEY, serialized);
    cache = next;
    serializedCache = serialized;
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
