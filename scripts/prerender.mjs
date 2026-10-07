// Pre-render: run the React app once at build time and put its HTML into
// dist/index.html. Visitors still get React (it "hydrates" this HTML), but
// crawlers and web filters that don't run JavaScript see the full page too.
import { readFile, rm, writeFile } from "node:fs/promises";

const dist = new URL("../dist/", import.meta.url);
const ssr = new URL("../dist-ssr/", import.meta.url);

const { render } = await import(new URL("entry-server.js", ssr).href);
const template = await readFile(new URL("index.html", dist), "utf8");
if (!template.includes("<!--app-html-->")) {
  throw new Error("dist/index.html has no <!--app-html--> placeholder");
}

const html = template.replace("<!--app-html-->", render());
await writeFile(new URL("index.html", dist), html);
await rm(ssr, { recursive: true, force: true });
console.log(`pre-rendered dist/index.html (${Math.round(html.length / 1024)} kB)`);
