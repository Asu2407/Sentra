import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/core/test/**/*.test.ts",
      "apps/api/test/**/*.test.ts",
      "apps/mcp/test/**/*.test.ts",
      "apps/web/test/**/*.test.tsx",
    ],
    environmentMatchGlobs: [["apps/web/**", "jsdom"]],
    hookTimeout: 180000,
    testTimeout: 30000,
    fileParallelism: false,
  },
});
