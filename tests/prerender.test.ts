import { describe, expect, test } from "vitest";
import { render } from "../site/src/entry-server";
import { PROJECTS } from "../site/src/data/projects";

const html = render();

describe("pre-rendered HTML (what crawlers and web filters see)", () => {
  test("contains the real content without running JavaScript", () => {
    expect(html).toContain("Tichakorn Taekratok");
    for (const project of PROJECTS) expect(html).toContain(project.title.replace("&", "&amp;"));
    expect(html).toContain("Under construction");
  });

  test("works with the strict Content-Security-Policy (no inline scripts or styles)", () => {
    // nginx.conf sends `default-src 'self'`, which blocks inline <script>,
    // <style> and style="" attributes.
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<style/i);
    expect(html).not.toMatch(/\sstyle="/i);
  });

  test("leaves the email address out, so Cloudflare doesn't rewrite it before hydration", () => {
    expect(html).not.toContain("ttaekratok@gmail.com");
  });
});
