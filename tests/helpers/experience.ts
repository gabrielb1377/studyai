import type { Page } from "@playwright/test";

export async function enableAdvancedMode(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("studyai:experience-settings", JSON.stringify({
      mode: "advanced",
      compactDensity: false,
      telemetryConsent: false,
      onboardingCompleted: true,
      dismissedGuides: [],
    }));
  });
}
