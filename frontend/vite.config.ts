/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // Component and logic tests written in TypeScript. The older
    // *.test.mjs files run under `node --test` (see scripts/check-all.sh).
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    // The whole-app acceptance tests step through every lesson; on a busy
    // machine they can pass 5 s. 20 s still catches a real hang.
    testTimeout: 20_000,
    // Traces real programs (print(x), while True) with the CPython tracer for the acceptance tests.
    globalSetup: ["./test/acceptance-traces.mjs"],
  },
});
