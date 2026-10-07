// Test setup: vitest.config.ts lists this file in setupFiles, so it runs
// before every test file. It adds DOM matchers like toBeInTheDocument(), stubs
// out the canvas and resets the DOM after each test. Most test files run in
// plain Node, without a DOM, so each DOM step first checks that the DOM exists.

// The matchers (toBeInTheDocument, toHaveTextContent, toHaveAttribute...) come
// from jest-dom. They say what's being checked, and a failure shows the
// element and what was expected, not just "expected false to be true". This
// import also brings their types, so tsc accepts them in app.test.tsx.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom has no canvas; the hero animation already copes with a null context.
// jsdom's own getContext() also returns null, but it reports a "Not
// implemented" error first, which would clutter the test output. This stub
// returns null quietly, so FlowField.tsx takes its "no canvas" path. The `as`
// cast tells TypeScript to accept the simpler function in place of the real,
// overloaded getContext signature.
if (typeof HTMLCanvasElement !== "undefined") {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
}

// cleanup() unmounts everything render() put on the page, so each test starts
// from an empty document and can't find leftovers from the one before.
// Testing Library does this by itself when the test runner provides a global
// afterEach; this config doesn't turn on Vitest's globals, so it's done here.
afterEach(() => {
  if (typeof document !== "undefined") cleanup();
});
