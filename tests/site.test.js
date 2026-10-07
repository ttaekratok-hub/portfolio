const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SITE = path.join(__dirname, "..", "site");
const html = fs.readFileSync(path.join(SITE, "index.html"), "utf8");

// Files that exist only after a build step or that you add yourself later.
const GENERATED_OR_OPTIONAL = new Set(["version.json", "resume.pdf"]);
const CATEGORIES = ["engineering", "techart", "devops", "networking"];

function loadProjects() {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(SITE, "projects.js"), "utf8"), sandbox);
  return sandbox.window.PROJECTS;
}

test("page has a title and every nav target exists", () => {
  assert.match(html, /<title>[^<]+<\/title>/);
  const anchors = [...html.matchAll(/href="#([\w-]+)"/g)].map((m) => m[1]);
  assert.ok(anchors.length > 0);
  for (const id of anchors) {
    assert.match(html, new RegExp(`id="${id}"`), `missing section #${id}`);
  }
});

test("every local href/src points at a real file", () => {
  const refs = [...html.matchAll(/(?:href|src)="([^"#:]+)"/g)].map((m) => m[1]);
  for (const ref of refs) {
    if (GENERATED_OR_OPTIONAL.has(ref)) continue;
    assert.ok(fs.existsSync(path.join(SITE, ref)), `broken link: ${ref}`);
  }
});

test("projects are well formed", () => {
  const projects = loadProjects();
  const allowed = new Set(CATEGORIES);
  assert.ok(Array.isArray(projects) && projects.length > 0);
  for (const p of projects) {
    assert.equal(typeof p.title, "string");
    assert.equal(typeof p.summary, "string");
    assert.ok(Array.isArray(p.tech));
    assert.ok(p.categories.length > 0, `${p.title} needs a category`);
    for (const c of p.categories) {
      assert.ok(allowed.has(c), `${p.title}: unknown category "${c}"`);
    }
  }
});

test("every filter button matches a known category", () => {
  const filters = [...html.matchAll(/data-filter="([\w-]+)"/g)].map((m) => m[1]);
  const used = new Set(loadProjects().flatMap((p) => p.categories));
  for (const f of filters) {
    if (f === "all") continue;
    assert.ok(used.has(f) || CATEGORIES.includes(f), `filter "${f}" has no projects and is not a known category`);
  }
});

test("security.txt is valid for at least another month", () => {
  // RFC 9116 requires an Expires date. CI goes red a month before it lapses:
  // bump the date (max one year ahead) when that happens.
  const txt = fs.readFileSync(path.join(SITE, ".well-known", "security.txt"), "utf8");
  assert.match(txt, /^Contact: mailto:\S+@\S+$/m);
  const expires = new Date(txt.match(/^Expires: (\S+)$/m)[1]);
  const days = (expires - Date.now()) / 86400000;
  assert.ok(days > 30, `security.txt expires in ${Math.floor(days)} days`);
  assert.ok(days < 366, "Expires should be at most a year ahead");
});
