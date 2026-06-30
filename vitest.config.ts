import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

/**
 * Vitest config for the decision-engine unit tests (readiness / load / 1RM /
 * capability logic). These are pure-logic tests — no DOM, no React render — so
 * we run them in the fast `node` environment.
 *
 * The `@/` alias mirrors tsconfig's `paths` ("@/*" -> "./src/*") so source files
 * under test that import via `@/...` resolve the same way Next.js resolves them.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(process.cwd(), "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.{test,spec}.{ts,tsx}"],
  },
});
