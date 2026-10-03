import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: 0,
  use: { baseURL: "http://127.0.0.1:3107", trace: "retain-on-failure" },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1080 } } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } }
  ],
  webServer: {
    command: "npm run start -- --port 3107",
    url: "http://127.0.0.1:3107",
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
    env: { NEXT_PUBLIC_DEMO_MODE: "true" }
  }
});
