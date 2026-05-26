import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: path.resolve(__dirname, "./client"),
  test: {
    environment: "node",
    globals: true,
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["**/playwright.smoke.spec.ts", "**/playwright.smoke.config.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client"),
      "server-only": path.resolve(__dirname, "./client/tests/server-only.ts"),
    },
  },
});
