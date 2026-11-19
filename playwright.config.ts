import { defineConfig } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PLAYWRIGHT_PORT inválida.");
const origin = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./tests/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  // Sem retries: uma falha intermitente precisa aparecer, não ser absorvida.
  // Spec instável vai para quarentena explícita (`test.fixme` com motivo).
  retries: 0,
  // Em CI, o relatório HTML alimenta o artefato `playwright-report/` do workflow.
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: origin,
    browserName: "chromium",
    channel: process.env.PLAYWRIGHT_CHANNEL,
    screenshot: "only-on-failure",
    storageState: {
      cookies: [],
      origins: [{
        origin,
        localStorage: [{ name: "studyai:offline-session", value: "active" }],
      }],
    },
  },
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: origin,
    reuseExistingServer: !process.env.PLAYWRIGHT_PORT,
    timeout: 120_000,
  },
});
