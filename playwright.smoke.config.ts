import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: ["playwright.smoke.spec.ts"],
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: "http://127.0.0.1:3001",
    acceptDownloads: true,
    viewport: { width: 1440, height: 1200 },
    trace: "on-first-retry",
  },
  reporter: [["list"]],
});
