import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.STAGING_URL ?? "https://cabinetz-dq7pucbp.manus.space",
    browserName: "chromium",
    headless: true,
    ...devices["Desktop Chrome"],
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
    },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
