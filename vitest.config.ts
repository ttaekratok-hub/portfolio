// Vitest configuration. Vitest is the test runner: it finds the test files,
// runs them and reports what passed. It's built on Vite, so tests go through
// the same compile step as the app and can import .tsx components directly.
// `npm test` runs every test once (CI does this in the `test` job); `npx vitest`
// keeps running and re-runs affected tests on every save.
//
// The tests are a mix of kinds:
//   - Unit-style checks of one piece of data or config, no browser involved:
//     tokens.test.ts (color contrast), security-txt.test.ts (expiry date),
//     k8s.test.ts (Kubernetes manifests follow the cluster's rules).
//   - Integration tests that render the whole <App /> into a simulated
//     browser and use it like a visitor would: app.test.tsx.
//   - A server-rendering check: prerender.test.ts renders the page the way the
//     build's pre-render step does (no build needed) and checks the HTML
//     crawlers get.
// CI adds the end-to-end layer on top: it runs the real container and a
// throwaway Kubernetes cluster, then fetches the page with curl.
//
// Tests have their own config. Without this file Vitest would read
// vite.config.ts, whose root is site/; Vitest looks for test files relative to
// the root, and tests/ sits next to site/, not inside it.
//
// Try it: npx vitest run tests/k8s.test.ts      (one file)
//         npx vitest run -t "filter"            (tests whose name matches)
// Learn more: https://vitest.dev/guide/ and https://vitest.dev/config/
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Compiles the JSX in app.test.tsx and the components it imports.
  plugins: [react()],
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    // Node by default; component tests opt into a browser-like DOM with
    // a `// @vitest-environment jsdom` comment at the top of the file.
    // jsdom is a JavaScript copy of the browser's DOM (document, elements,
    // events) that runs inside Node. It has no layout or painting, and it
    // takes time to set up, so only files that render components use it.
    // Learn more: https://vitest.dev/guide/environment
    environment: "node",
    // Runs before every test file, in that file's environment.
    setupFiles: ["tests/setup.ts"],
    // No `globals: true`: each test imports describe/test/expect from
    // "vitest", which keeps every name's origin visible (see tests/setup.ts
    // for the one side effect).
  },
});
