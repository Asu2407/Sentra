import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.mts/,
  timeout: 60000,
  use: {
    headless: true,
    channel: "chrome",
  },
});
