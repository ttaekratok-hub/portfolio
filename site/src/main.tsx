// The browser entry point. index.html loads this file; Vite bundles it, with
// everything it imports, into dist/assets/index-<hash>.js (the CSS it imports
// is split out into index-<hash>.css, the fonts into .woff2 files). Its one
// job is to start React on the page's <div id="root">. Its build-time twin is
// entry-server.tsx, which renders the same <App /> to HTML for the pre-render.
import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { App } from "./App";

// The `!` (non-null assertion) tells TypeScript "this is never null":
// index.html always has a #root element.
const root = document.getElementById("root")!;
// StrictMode is a development-only checker. It renders every component twice,
// and runs every effect's setup, cleanup, then setup again, so impure rendering
// and missing cleanup show up right away. It adds no HTML and does nothing in a
// production build. Learn more: https://react.dev/reference/react/StrictMode
const app = (
  <StrictMode>
    <App />
  </StrictMode>
);

// Two ways to start React:
// - hydrateRoot: #root already holds the pre-rendered HTML (production), so
//   React "hydrates" it: it walks the existing DOM, attaches event handlers and
//   starts effects instead of redrawing. This only works if the first browser
//   render produces exactly that HTML; components/Contact.tsx shows how to
//   handle a value that must differ (useIsBrowser).
// - createRoot: #root is empty, so React builds the DOM from scratch.
// Note: `npm run dev` serves site/index.html without pre-rendering, but #root
// still holds the <!--app-html--> placeholder, and a comment counts as a child
// node. So dev takes the hydrate path: React finds no matching HTML, logs a
// "Hydration failed" error in the console, then renders from scratch.
// Learn more: https://react.dev/reference/react-dom/client/hydrateRoot
if (root.hasChildNodes()) {
  hydrateRoot(root, app);
} else {
  createRoot(root).render(app);
}
