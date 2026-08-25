import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test-setup.js",
    // e2e/ holds Playwright specs (real-browser tests, run via `npm run
    // test:e2e`) -- they also match Vitest's default *.spec.ts pattern and
    // import their own `test`/`expect` from @playwright/test, which
    // collides with Vitest's globals if picked up here.
    exclude: ["**/node_modules/**", "e2e/**"],
  },
});
