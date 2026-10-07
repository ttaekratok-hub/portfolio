import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    // Node by default; component tests opt into a browser-like DOM with
    // a `// @vitest-environment jsdom` comment at the top of the file.
    environment: "node",
    setupFiles: ["tests/setup.ts"],
  },
});
