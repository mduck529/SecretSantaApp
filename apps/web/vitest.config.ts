import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      // "server-only" throws outside Next's server bundle; it's a no-op in tests.
      "server-only": fileURLToPath(new URL("./test/empty.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: { include: ["test/**/*.test.ts"] },
});
