import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:4173/",
    browserName: "chromium",
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true,
  },
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  projects: [
    {
      name: "chromium",
    },
  ],
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4173 --strictPort",
    env: {
      PW_TEST: "1",
    },
    url: "http://127.0.0.1:4173/",
    reuseExistingServer: process.env.PW_REUSE_SERVER !== "0", // Set PW_REUSE_SERVER=0 to force fresh build
    timeout: 180_000,
  },
});
