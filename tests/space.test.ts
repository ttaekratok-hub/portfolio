// Tests for the space theme's pure parts (no WebGL needed): the seeded random
// numbers, the galaxy generator and the project map layout. Plus a check on
// the built files that Three.js stays out of the main bundle, which is what
// keeps the page fast: the ~150 kB of 3D code loads only after the page is up.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { PROJECTS } from "../site/src/data/projects";
import { DEFAULT_GALAXY, generateGalaxy } from "../site/src/space/galaxy";
import { CATEGORY_ORDER, layoutSystems, slug } from "../site/src/space/layout";
import { gaussian, seededRandom } from "../site/src/space/random";

describe("seeded random numbers", () => {
  test("the same seed gives the same sequence; a different seed doesn't", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const c = seededRandom(43);
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect([c(), c(), c()]).not.toEqual(first);
  });

  test("values stay in [0, 1) and the gaussian is centered on 0", () => {
    const random = seededRandom(7);
    let sum = 0;
    for (let i = 0; i < 10_000; i++) {
      const v = random();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += gaussian(random);
    }
    expect(Math.abs(sum / 10_000)).toBeLessThan(0.05);
  });
});

describe("galaxy generator", () => {
  const options = { ...DEFAULT_GALAXY, count: 5000 };
  const galaxy = generateGalaxy(options);

  test("returns one entry per star, the same every time", () => {
    expect(galaxy.positions).toHaveLength(5000 * 3);
    expect(galaxy.radial).toHaveLength(5000);
    expect(generateGalaxy(options).positions).toEqual(galaxy.positions);
  });

  test("is a thin disc, mostly within the radius, densest near the core", () => {
    let inside = 0;
    let core = 0;
    let maxHeight = 0;
    for (let i = 0; i < 5000; i++) {
      const r = Math.hypot(galaxy.positions[i * 3]!, galaxy.positions[i * 3 + 2]!);
      if (r <= options.radius * 1.2) inside++;
      if (r <= options.radius * 0.3) core++;
      maxHeight = Math.max(maxHeight, Math.abs(galaxy.positions[i * 3 + 1]!));
    }
    expect(inside / 5000).toBeGreaterThan(0.98);
    // 30% of the radius is 9% of the disc's area; it holds far more stars than that.
    expect(core / 5000).toBeGreaterThan(0.25);
    expect(maxHeight).toBeLessThan(options.radius * 0.5);
  });
});

describe("project map layout", () => {
  const systems = layoutSystems();

  test("every project is exactly one system, with a unique id matching its card", () => {
    expect(systems).toHaveLength(PROJECTS.length);
    expect(new Set(systems.map((s) => s.id)).size).toBe(PROJECTS.length);
    for (const project of PROJECTS) {
      expect(systems.some((s) => s.id === slug(project.title))).toBe(true);
    }
  });

  test("every category the projects use has a place on the map", () => {
    for (const project of PROJECTS) expect(CATEGORY_ORDER).toContain(project.categories[0]);
  });

  test("systems don't overlap", () => {
    for (const a of systems) {
      for (const b of systems) {
        if (a === b) continue;
        const d = Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2]);
        expect(d, `${a.id} vs ${b.id}`).toBeGreaterThan(1.2);
      }
    }
  });
});

// Vite names the main bundle index-<hash>.js; dynamic imports become other
// files. WebGLRenderer is a class name only Three.js contains. Skipped until
// `npm run build` has made dist/ (CI builds before it tests).
test.skipIf(!existsSync("dist/assets"))("Three.js is split out of the main bundle", () => {
  const files = readdirSync("dist/assets").filter((f) => f.endsWith(".js"));
  const main = files.filter((f) => f.startsWith("index-"));
  expect(main.length).toBeGreaterThan(0);
  for (const f of main) expect(readFileSync(`dist/assets/${f}`, "utf8")).not.toContain("WebGLRenderer");
  expect(files.some((f) => readFileSync(`dist/assets/${f}`, "utf8").includes("WebGLRenderer"))).toBe(true);
});
