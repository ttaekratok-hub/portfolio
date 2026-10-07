import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

// Reads the design tokens and checks WCAG contrast of every text/background
// pair in both appearances, so a color change can't quietly hurt legibility.
const css = readFileSync("site/src/styles/tokens.css", "utf8");

function block(selectorStart: string): string {
  const start = css.indexOf(selectorStart);
  return css.slice(start, css.indexOf("\n}", start));
}
function vars(text: string): Record<string, string> {
  return Object.fromEntries([...text.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
}
const light = vars(block(":root {"));
const dark = { ...light, ...vars(block("@media (prefers-color-scheme: dark)")) };

function rgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`expected a 6-digit hex color, got ${hex}`);
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
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

for (const [name, theme] of [["light", light], ["dark", dark]] as const) {
  describe(`${name} appearance`, () => {
    test.each(PAIRS)("%s on %s is at least 4.5:1", (text, background) => {
      const ratio = contrast(theme[text]!, theme[background]!);
      expect(ratio, `${text} ${theme[text]} on ${background} ${theme[background]}`).toBeGreaterThanOrEqual(4.5);
    });
  });
}
