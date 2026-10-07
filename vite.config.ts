// Vite configuration: the tool that turns site/ (TypeScript, JSX, CSS) into
// files a browser can load. Vite has two jobs, both driven by this file:
//
// - Dev server (`npm run dev`, http://localhost:5173). Vite serves the source
//   files almost as they are: the browser loads them as native ES modules, and
//   Vite compiles each .ts/.tsx file the moment the browser asks for it. Your
//   own code isn't bundled (only npm dependencies are, once, up front), so
//   startup is fast. Save a file and Hot Module Replacement (HMR) swaps just
//   that module into the open page, usually without a full reload.
// - Production build (`npm run build`). Vite starts from site/index.html (in
//   Vite, the HTML file is the entry point), follows every import from
//   main.tsx, then bundles: it compiles TypeScript and JSX to plain JavaScript,
//   joins the many source files into a few, minifies them and writes them to
//   dist/assets/ with a content hash in each name (index-<hash>.js). Finally it
//   rewrites index.html to load those files. The bundler inside Vite 8 is
//   Rolldown.
//
// Why hashed names matter: a file's name changes whenever its content
// changes, so nginx.conf can tell browsers to cache /assets/ for a year. A
// deploy that changes a file gives it a new URL, so nobody gets stuck with a
// stale copy.
//
// The same config also drives the second step of `npm run build`,
// `vite build --ssr src/entry-server.tsx --outDir ../dist-ssr`: a server-side
// rendering (SSR) build, which compiles the same components for Node.js instead
// of the browser. scripts/prerender.mjs runs that output once to put the page's
// HTML into dist/index.html. Tests use their own config (vitest.config.ts).
//
// Try it:
//   npm run dev, open http://localhost:5173 and edit a sentence in
//     site/src/data/profile.ts: the page updates as you save.
//   npm run build && ls dist/assets: change a color in tokens.css, build again,
//     and the CSS file's hash changes while the font files' hashes don't.
// Learn more: https://vite.dev/guide/ and https://vite.dev/config/
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// defineConfig only adds types: the editor autocompletes the options and tsc
// checks them (tsconfig.json includes this file).
export default defineConfig({
  // The project root, where Vite looks for index.html and public/. The app
  // lives in site/ (index.html, src/, public/), apart from the repo's tooling.
  // Files in site/public/ (resume.pdf, icons, robots.txt, .well-known/) are
  // copied to dist/ unchanged and unhashed, so their URLs never change.
  root: "site",
  // The React plugin compiles JSX with the automatic runtime (so components
  // don't need `import React`) and, in the dev server, adds React Fast Refresh:
  // an edited component re-renders in place and keeps its state.
  plugins: [react()],
  build: {
    // Paths here are relative to root, so this is dist/ at the repo root. The
    // Dockerfile runs `npm run build` in its Node stage, then copies only dist/
    // (and nginx.conf) into the nginx image that runs in production.
    outDir: "../dist",
    // Vite only empties an outDir inside root on its own; for one outside it,
    // Vite warns and leaves old files in place. Emptying it on every build
    // stops hashed files from earlier builds piling up in dist/assets/.
    emptyOutDir: true,
  },
});
