// Checks the pre-rendered HTML: the page as crawlers, link previews and web
// filters get it, before any JavaScript runs. It calls the same render() that
// scripts/prerender.mjs uses at build time, straight from the source, so no
// build is needed.
//
// It runs in plain Node, with no window or document, just like the real
// pre-render. So it also catches a component that touches a browser-only API
// while rendering instead of inside useEffect: render() would throw here
// before it could break `npm run build`.
// See site/src/entry-server.tsx for how pre-rendering works.
import { describe, expect, test } from "vitest";
import { render } from "../site/src/entry-server";
import { PROJECTS } from "../site/src/data/projects";

// Rendered once, when the file loads, and shared by every test below.
const html = render();

describe("pre-rendered HTML (what crawlers and web filters see)", () => {
  test("contains the real content without running JavaScript", () => {
    expect(html).toContain("Tichakorn Taekratok");
    // React escapes text for HTML, so "Linux & Kubernetes" is written as
    // "Linux &amp; Kubernetes" in the markup.
    for (const project of PROJECTS) expect(html).toContain(project.title.replace("&", "&amp;"));
    expect(html).toContain("Under construction");
  });

  // A Content-Security-Policy (CSP) is a response header that tells the
  // browser where a page may load scripts, styles and other resources from.
  // Anything else is blocked, so code an attacker manages to slip into the
  // page can't run.
  test("works with the strict Content-Security-Policy (no inline scripts or styles)", () => {
    // nginx.conf sends `default-src 'self'`, which blocks inline <script>,
    // <style> and style="" attributes: only files served by the site itself
    // are allowed. render() returns just the markup inside #root; the
    // <script src> tag in index.html loads a file from the site, which 'self'
    // allows. A component using React's style={{...}} prop would show up here
    // as a style="" attribute, which the browser would refuse to apply.
    // Learn more: https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<style/i);
    expect(html).not.toMatch(/\sstyle="/i);
  });

  // Cloudflare's email obfuscation rewrites any address it finds in the HTML,
  // which would make the page differ from what React expects when it hydrates
  // (attaches to the existing HTML). Contact.tsx adds the address only in the
  // browser; this keeps it that way.
  test("leaves the email address out, so Cloudflare doesn't rewrite it before hydration", () => {
    expect(html).not.toContain("ttaekratok@gmail.com");
  });
});
