import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const artifactRoot = process.env.E2E_ARTIFACTS_ROOT ?? path.resolve("playwright-output", "local");
const webBaseUrl = process.env.E2E_WEB_BASE_URL ?? "http://web:3000";

export default defineConfig({
  testDir: "./e2e/tests",
  outputDir: path.join(artifactRoot, "test-results"),
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 1,
  reporter: [
    ["line"],
    ["html", { outputFolder: path.join(artifactRoot, "playwright-report"), open: "never" }],
    ["json", { outputFile: path.join(artifactRoot, "playwright-report.json") }],
  ],
  use: {
    baseURL: webBaseUrl,
    storageState: path.join(artifactRoot, "test-results", ".auth", "empty.json"),
    testIdAttribute: "data-testid",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
