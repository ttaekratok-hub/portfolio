// Pre-render: run the React app once at build time and put its HTML into
// dist/index.html. Visitors still get React (it "hydrates" this HTML), but
// crawlers and web filters that don't run JavaScript see the full page too.
//
// Where this fits: `npm run build` (package.json) runs three steps in order:
//   1. vite build                  the browser build: dist/index.html, plus the
//                                  bundled JS and CSS in dist/assets/
//   2. vite build --ssr ...        the same components compiled for Node.js into
//                                  dist-ssr/entry-server.js, which exports render()
//   3. node scripts/prerender.mjs  this file: calls render() and pastes the HTML
//                                  over the placeholder inside <div id="root">
// The Dockerfile runs `npm run build`, and nginx then serves dist/ as plain files:
// no Node.js server runs in production. Rendering React to HTML outside the browser
// is server-side rendering (SSR); doing it once at build time instead of on every
// request is called pre-rendering, or static site generation (SSG).
//
// Try it: npm run build && grep -o '<h1.*</h1>' dist/index.html
//   The heading is already in the HTML file, before any JavaScript has run.
// Learn more: https://vite.dev/guide/ssr
import { readFile, rm, writeFile } from "node:fs/promises";

// Paths relative to this file (import.meta.url), not to the shell's current
// directory, so the script works no matter where it's started from.
const dist = new URL("../dist/", import.meta.url);
const ssr = new URL("../dist-ssr/", import.meta.url);

// Load the bundle from step 2. Node can't run entry-server.tsx directly (JSX, and
// App.tsx imports CSS files), which is why Vite compiles it to plain JavaScript
// first. `await` at the top level works because this is an ES module (.mjs).
const { render } = await import(new URL("entry-server.js", ssr).href);
const template = await readFile(new URL("index.html", dist), "utf8");
// Fail the build loudly instead of shipping an empty page: without the
// placeholder, replace() below would silently change nothing.
if (!template.includes("<!--app-html-->")) {
  throw new Error("dist/index.html has no <!--app-html--> placeholder");
}

// render() returns the HTML for everything inside #root. The <head>, and the
// script and stylesheet tags Vite added in step 1, stay as they are.
const html = template.replace("<!--app-html-->", render());
await writeFile(new URL("index.html", dist), html);
// dist-ssr/ was only needed for this step; nothing in it is served.
await rm(ssr, { recursive: true, force: true });
console.log(`pre-rendered dist/index.html (${Math.round(html.length / 1024)} kB)`);
