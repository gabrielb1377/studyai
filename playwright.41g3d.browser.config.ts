import { defineConfig } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT || 3113);
const origin = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  retries: 0,
  use: {
    baseURL: origin,
    browserName: "chromium",
    screenshot: "only-on-failure",
    storageState: {
      cookies: [],
      origins: [{ origin, localStorage: [{ name: "studyai:offline-session", value: "active" }] }],
    },
  },
  webServer: {
    command: `rtk powershell -NoProfile -Command "$env:DATABASE_URL=' '; $env:S3_ACCESS_KEY_ID=' '; $env:S3_SECRET_ACCESS_KEY=' '; $env:S3_ENDPOINT=' '; $env:S3_BUCKET=' '; npm run dev -- --hostname 127.0.0.1 --port ${port}"`,
    url: origin,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
