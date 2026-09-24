"use client";

import { useEffect } from "react";
import { useExperiencePreferences } from "./ExperiencePreferences";

export function ExperienceProvider() {
  const preferences = useExperiencePreferences();
  useEffect(() => {
    document.documentElement.dataset.experienceMode = preferences.mode;
    document.documentElement.dataset.density = preferences.compactDensity ? "compact" : "comfortable";
    document.documentElement.dataset.reducedMotion = preferences.reducedMotion ? "true" : "false";
    document.documentElement.dataset.contrast = preferences.highContrast ? "high" : "normal";
    document.documentElement.dataset.fontScale = preferences.fontScale;
  }, [preferences.compactDensity, preferences.fontScale, preferences.highContrast, preferences.mode, preferences.reducedMotion]);
  return null;
}
