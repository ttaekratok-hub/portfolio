// Reads the design tokens and checks WCAG contrast of every text/background
// pair in both appearances, so a color change can't quietly hurt legibility.
//
// Design tokens are the named CSS variables in site/src/styles/tokens.css
// (--label, --bg...): light-mode values, plus a dark-mode block that overrides
// the colors. WCAG (Web Content Accessibility Guidelines) measures legibility
// as a contrast ratio from 1:1 (same color) to 21:1 (black on white).
// tokens.css explains the rule in more detail.
//
// There's no CSS parser here: block() and vars() scan tokens.css as text. That
// keeps the test tiny, and it relies on the file's layout: each block ends
// with a `}` at the start of a line, and each token is one `--name: value;`.
//
// Try it: npx vitest run tests/tokens.test.ts
//   Each pair is its own test, so a failure names the exact pair and colors.
// Learn more: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

// Read as plain text; the path is relative to the repo root, where npm test runs.
const css = readFileSync("site/src/styles/tokens.css", "utf8");

// The text of one CSS block: from the first occurrence of selectorStart to
// the next `}` at the start of a line, which closes that block.
function block(selectorStart: string): string {
  const start = css.indexOf(selectorStart);
  return css.slice(start, css.indexOf("\n}", start));
}
// Every `--name: value;` in the text, as an object: { label: "#1d1d1f", ... }.
// matchAll returns each match; m[1] and m[2] are the two ( ) groups.
function vars(text: string): Record<string, string> {
  return Object.fromEntries([...text.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
}
const light = vars(block(":root {"));
// The dark block redefines only appearance values (colors, shadows), not fonts
// or spacing, so start from the light values and let the dark ones override
// them, just as the CSS cascade does in the browser.
const dark = { ...light, ...vars(block("@media (prefers-color-scheme: dark)")) };

// "#0066cc" -> [0, 102, 204]: each pair of hex digits is one channel, 0-255.
function rgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`expected a 6-digit hex color, got ${hex}`);
  const n = parseInt(m[1]!, 16);
  // >> shifts the bits right and & 255 keeps the lowest 8 bits (one byte).
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
// Relative luminance, WCAG's measure of how bright a color looks, from 0
// (black) to 1 (white). Screen values are gamma-encoded: the first step undoes
// that to get the actual light level of each channel. The weights reflect the
// eye: green looks far brighter than blue at the same level. 0.03928 is the
// constant in WCAG 2's formula (the sRGB standard says 0.04045; for 8-bit
// colors both give the same result).
function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
// The contrast ratio: lighter over darker, each plus 0.05 (which accounts for
// room light reflecting off the screen). Sorting first means it doesn't
// matter which of the two colors is the text.
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// [text token, background token]: all small text, so WCAG AA needs 4.5:1.
const PAIRS: Array<[string, string]> = [
  ["label", "bg"],
  ["label", "bg-elevated"],
  ["label-secondary", "bg"],
  ["label-secondary", "bg-elevated"],
  ["tint", "bg"],
  ["tint", "bg-elevated"],
  ["on-tint", "tint-fill"],
];

// Generates one test per pair and appearance: 7 pairs x 2 = 14 tests.
// test.each fills the %s placeholders in the name with each pair's values.
for (const [name, theme] of [["light", light], ["dark", dark]] as const) {
  describe(`${name} appearance`, () => {
    test.each(PAIRS)("%s on %s is at least 4.5:1", (text, background) => {
      const ratio = contrast(theme[text]!, theme[background]!);
      expect(ratio, `${text} ${theme[text]} on ${background} ${theme[background]}`).toBeGreaterThanOrEqual(4.5);
    });
  });
}
