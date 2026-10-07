// The build-time entry point, twin of main.tsx. It never runs in a visitor's
// browser: `vite build --ssr` compiles it for Node.js into
// dist-ssr/entry-server.js, and scripts/prerender.mjs calls render() once and
// writes the result into dist/index.html. tests/prerender.test.ts imports it
// directly to check what crawlers will see.
//
// Server-side rendering (SSR) runs components outside a browser to produce
// HTML. Only rendering happens: effects (useEffect), refs and event handlers
// don't run, and there's no window or document. That's why the components only
// touch browser APIs (canvas, IntersectionObserver, fetch) inside useEffect,
// which runs in the browser after hydration.
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { App } from "./App";

/**
 * Renders the whole page to HTML at build time (see scripts/prerender.mjs).
 *
 * renderToString, not renderToStaticMarkup, because hydrateRoot in main.tsx
 * must be able to pick this HTML up. It doesn't wait for data loading
 * (Suspense); this page has no async data, so the simplest API fits.
 * The tree matches main.tsx, StrictMode included.
 * Learn more: https://react.dev/reference/react-dom/server/renderToString
 */
export function render(): string {
  return renderToString(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
