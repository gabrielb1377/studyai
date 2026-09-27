import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  retries: process.env.CI ? 2 : 1,
  use: {
    baseURL: "http://localhost:3000",
    browserName: "chromium",
    channel: process.env.PLAYWRIGHT_CHANNEL,
    screenshot: "only-on-failure",
    storageState: {
      cookies: [],
      origins: [{
        origin: "http://localhost:3000",
        localStorage: [{ name: "studyai:offline-session", value: "active" }],
      }],
    },
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
