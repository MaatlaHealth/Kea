import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // `server-only` throws when imported outside a React Server Component.
      // Tests run in plain Node, so it is replaced with an empty module. The
      // guard still applies to the application build, which is where it matters.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // The integration suite shares one database, so files must not run in
    // parallel against it.
    fileParallelism: false,
  },
});
