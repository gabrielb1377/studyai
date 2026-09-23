"use client";

import { useEffect } from "react";
import { useExperiencePreferences } from "./ExperiencePreferences";

export function ExperienceProvider() {
  const preferences = useExperiencePreferences();
  useEffect(() => {
    document.documentElement.dataset.experienceMode = preferences.mode;
    document.documentElement.dataset.density = preferences.compactDensity ? "compact" : "comfortable";
  }, [preferences.compactDensity, preferences.mode]);
  return null;
}
