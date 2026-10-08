// Prints resume/resume.html to site/public/resume.pdf with headless Chromium.
// Run it after editing the résumé: `npm run resume`, then commit both files.
//
// It runs on a developer machine (or a cloud session), not in CI or the
// Docker build: those only copy the finished PDF, so they don't need a browser.
//
// playwright-core is Playwright without bundled browsers. It uses the Chromium
// that Playwright already installed (PLAYWRIGHT_BROWSERS_PATH), or the one at
// $CHROMIUM_PATH if you set it.
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const source = new URL("../resume/resume.html", import.meta.url);
const output = fileURLToPath(new URL("../site/public/resume.pdf", import.meta.url));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  const page = await browser.newPage();
  await page.goto(source.href, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  // preferCSSPageSize: the size and margins come from @page in resume.html.
  await page.pdf({ path: output, preferCSSPageSize: true, printBackground: true });
} finally {
  // Always close the browser, even if printing failed: a leftover headless
  // Chromium keeps running and holding memory.
  await browser.close();
}

// A résumé must stay one page. pdfinfo (poppler) counts them, if installed.
let pages;
try {
  pages = Number(/Pages:\s+(\d+)/.exec(execFileSync("pdfinfo", [output], { encoding: "utf8" }))?.[1]);
} catch {
  console.warn("pdfinfo not found: check by eye that the PDF is one page.");
}
if (pages !== undefined && pages !== 1) {
  console.error(`resume.pdf is ${pages} pages; trim resume/resume.html to fit one page.`);
  process.exit(1);
}
console.log(`wrote ${output}${pages ? ` (${pages} page)` : ""}`);
