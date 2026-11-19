import type { Page } from "@playwright/test";

export async function enableAdvancedMode(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("studyai:experience-settings:offline-session", JSON.stringify({
      mode: "advanced",
      compactDensity: false,
      telemetryConsent: false,
      onboardingCompleted: true,
      dismissedGuides: [],
    }));
  });
}
