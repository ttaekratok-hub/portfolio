// @vitest-environment jsdom
// Tests for the galaxy map of projects: the pure parts (the hyperlane network
// and label placement in site/src/space/map/) and the React overlay
// (components/GalaxyMap.tsx).
//
// jsdom has no WebGL, so the overlay tests replace the WebGL scene with a fake
// one (vi.mock below) that records what the component asks of it and reports
// made-up screen positions. That's enough to test everything the visitor
// interacts with: the buttons, their names, the detail panel, the keyboard.
// The drawing itself is checked by eye, in the browser.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { Projects } from "../site/src/components/Projects";
import { PROJECTS } from "../site/src/data/projects";
import { layoutSystems, slug } from "../site/src/space/layout";
import type { GalaxyMapCallbacks } from "../site/src/space/map";
import { matchesFilter, placeLabels, shortLabel, type LabelInput } from "../site/src/space/map/labels";
import { buildNetwork, type MapNode } from "../site/src/space/map/network";
import { MAX_SYSTEMS } from "../site/src/space/map/shared";
import type { MapSystem, SceneOptions } from "../site/src/space/types";

// ---------- The fake scene ----------

// vi.hoisted runs before the vi.mock calls below, which Vitest moves to the
// top of the file; the mocks can only use variables created this way.
const fake = vi.hoisted(() => ({
  webgl: true,
  fail: false,
  /** A system the fake reports as off-screen. */
  offscreen: null as string | null,
  calls: [] as Array<[string, unknown]>,
}));

// Every export of palette.ts stays real except webglAvailable.
vi.mock("../site/src/space/palette", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../site/src/space/palette")>()),
  webglAvailable: () => fake.webgl,
}));

vi.mock("../site/src/space/map", () => ({
  createGalaxyMap(_canvas: HTMLCanvasElement, systems: MapSystem[], callbacks: GalaxyMapCallbacks) {
    if (fake.fail) throw new Error("WebGL context could not be created");
    // Systems spread on a diagonal, all on screen (inside the 720 x 480 frame
    // below) however many projects there are.
    const report = () =>
      callbacks.onScreenPositions(
        systems.map((s, i) => ({
          id: s.id,
          x: 60 + (i * 600) / systems.length,
          y: 40 + (i * 400) / systems.length,
          visible: s.id !== fake.offscreen,
          depth: i / systems.length,
          ringX: 0,
          ringY: 0,
        })),
      );
    return {
      update: (options: SceneOptions) => fake.calls.push(["update", options]),
      focus(id: string | null) {
        fake.calls.push(["focus", id]);
        report();
      },
      highlight: (filter: string) => fake.calls.push(["highlight", filter]),
      dispose: () => fake.calls.push(["dispose", null]),
    };
  },
}));

// jsdom doesn't lay anything out, so every element measures 0 x 0 and the
// map would hide all its systems as "off-screen". Give elements a size.
const sizes = { clientWidth: 720, clientHeight: 480 };
const originals = Object.keys(sizes).map((key) => [key, Object.getOwnPropertyDescriptor(HTMLElement.prototype, key)] as const);
beforeAll(() => {
  for (const [key, value] of Object.entries(sizes)) {
    Object.defineProperty(HTMLElement.prototype, key, { configurable: true, get: () => value });
  }
});
afterAll(() => {
  for (const [key, descriptor] of originals) if (descriptor) Object.defineProperty(HTMLElement.prototype, key, descriptor);
});
beforeEach(() => {
  fake.webgl = true;
  fake.fail = false;
  fake.offscreen = null;
  fake.calls = [];
});

const lastCall = (name: string) => fake.calls.filter(([n]) => n === name).at(-1)?.[1];
/** A regular expression matching `text` literally ("C++" has special characters). */
const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Renders the Projects section and waits for the map's system buttons. */
async function renderMap() {
  const utils = render(<Projects />);
  const map = screen.getByRole("group", { name: "Galaxy map of projects" });
  // The scene starts when the browser is idle (a 300 ms timer in jsdom),
  // then the buttons appear, then they're placed.
  await waitFor(() => expect(map.querySelector(".galaxy-system[data-placed]")).not.toBeNull(), { timeout: 2000 });
  return { ...utils, map };
}

// ---------- The overlay ----------

describe("galaxy map overlay", () => {
  test("every project is a button named by its title and categories", async () => {
    const { map } = await renderMap();
    for (const project of PROJECTS) {
      const button = within(map).getByRole("button", { name: new RegExp(`^${literal(project.title)},`) });
      expect(button).toHaveAttribute("aria-pressed", "false");
      // The visible label is part of the accessible name (WCAG 2.5.3).
      expect(button.getAttribute("aria-label")).toContain(button.textContent!);
    }
    expect(within(map).getByRole("button", { name: "This Portfolio, Cloud & DevOps and Software" })).toBeInTheDocument();
  });

  test("selecting a system opens its details; Escape closes them", async () => {
    const user = userEvent.setup();
    const { map } = await renderMap();
    const button = within(map).getByRole("button", { name: /^This Portfolio,/ });
    await user.click(button);

    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(lastCall("focus")).toBe("this-portfolio");
    const panel = within(map).getByRole("region", { name: "This Portfolio" });
    expect(within(panel).getByText("2026")).toBeInTheDocument();
    expect(within(panel).getByRole("list", { name: "Built with" })).toHaveTextContent("Flux");
    expect(within(panel).getByRole("link", { name: "View project card for This Portfolio" })).toHaveAttribute(
      "href",
      "#this-portfolio",
    );
    // The polite live region reads the panel's main content.
    expect(screen.getByText(/^This Portfolio, 2026\. React and TypeScript/)).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(within(map).queryByRole("region")).toBeNull();
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(lastCall("focus")).toBeNull();
  });

  test("the close button closes the panel and puts focus back on the system", async () => {
    const user = userEvent.setup();
    const { map } = await renderMap();
    const button = within(map).getByRole("button", { name: /^Space Scene/ });
    await user.click(button);
    await user.click(within(map).getByRole("button", { name: "Close details" }));
    expect(within(map).queryByRole("region")).toBeNull();
    expect(button).toHaveFocus();
  });

  test("keyboard: Enter selects, and Tab goes from the system into its panel, then on", async () => {
    const user = userEvent.setup();
    const { map } = await renderMap();
    const systems = within(map).getAllByRole("button");
    systems[0]!.focus();
    await user.keyboard("{Enter}");
    expect(systems[0]).toHaveAttribute("aria-pressed", "true");
    await user.tab();
    expect(screen.getByRole("button", { name: "Close details" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: /^View project card/ })).toHaveFocus();
    await user.tab();
    expect(systems[1]).toHaveFocus();
    // Escape from inside the panel returns focus to the system.
    await user.tab({ shift: true });
    await user.keyboard("{Escape}");
    expect(systems[0]).toHaveFocus();
  });

  test("the filter dims systems outside it and tells the scene", async () => {
    const user = userEvent.setup();
    const { map } = await renderMap();
    expect(lastCall("highlight")).toBe("all");
    await user.click(screen.getByRole("button", { name: "Software" }));
    expect(lastCall("highlight")).toBe("software");
    // This Portfolio is in Cloud & DevOps *and* Software, so it stays lit.
    expect(within(map).getByRole("button", { name: /^This Portfolio,/ })).not.toHaveClass("is-dimmed");
    expect(within(map).getByRole("button", { name: /^MikroTik/ })).toHaveClass("is-dimmed");
  });

  test("“View project card” shows all projects first when the filter hides that card", async () => {
    const user = userEvent.setup();
    const { map } = await renderMap();
    await user.click(screen.getByRole("button", { name: "Networking" }));
    expect(document.getElementById("space-scene-galaxy-map")).toBeNull();
    await user.click(within(map).getByRole("button", { name: /^Space Scene/ }));
    await user.click(screen.getByRole("link", { name: /^View project card/ }));
    expect(document.getElementById("space-scene-galaxy-map")).not.toBeNull();
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
  });

  test("each button is moved onto its star; one off-screen is hidden (and out of the Tab order)", async () => {
    fake.offscreen = "c-object-oriented-programs";
    const { map } = await renderMap();
    const buttons = within(map).getAllByRole("button");
    expect(buttons).toHaveLength(PROJECTS.length - 1);
    // The first system, reported at (60, 40).
    expect(buttons[0]!.style.transform).toBe("translate(60.0px, 40.0px)");
    // (A hidden element has no accessible name, so it's found by its label.)
    const hidden = map.querySelector<HTMLButtonElement>('[aria-label^="C++ Object-Oriented Programs"]')!;
    expect(hidden.hidden).toBe(true);
  });

  test("the scene is freed when the map goes away", async () => {
    const { unmount } = await renderMap();
    unmount();
    expect(lastCall("dispose")).toBeNull();
    expect(fake.calls.some(([name]) => name === "dispose")).toBe(true);
  });

  test("without WebGL, a note replaces the map", async () => {
    fake.webgl = false;
    render(<Projects />);
    expect(await screen.findByText("The interactive map needs WebGL; every project is listed below.")).toBeInTheDocument();
  });

  test("if WebGL fails to start, the same note appears", async () => {
    fake.fail = true;
    render(<Projects />);
    expect(
      await screen.findByText("The interactive map needs WebGL; every project is listed below.", {}, { timeout: 2000 }),
    ).toBeInTheDocument();
  });
});

// ---------- Pure parts ----------

describe("map content", () => {
  test("the shaders have room for every project", () => {
    expect(PROJECTS.length).toBeLessThanOrEqual(MAX_SYSTEMS);
  });

  test("each short label is a piece of its full title (Label in Name)", () => {
    for (const project of PROJECTS) {
      expect(project.title).toContain(shortLabel(slug(project.title), project.title));
    }
  });

  test("a project matches a filter through any of its categories", () => {
    expect(matchesFilter("this-portfolio", "software")).toBe(true);
    expect(matchesFilter("this-portfolio", "infrastructure")).toBe(true);
    expect(matchesFilter("this-portfolio", "networking")).toBe(false);
    expect(matchesFilter("mikrotik-ospf-network-lab", "all")).toBe(true);
  });
});

describe("hyperlane network", () => {
  const systems = layoutSystems();
  const network = buildNetwork(systems, { stars: 64 });
  const { nodes, lanes } = network;

  test("is the same on every visit (seeded)", () => {
    expect(buildNetwork(systems, { stars: 64 })).toEqual(network);
  });

  test("starts with the project systems, then adds spaced-out unclaimed stars", () => {
    expect(nodes.slice(0, systems.length).map((n) => n.system)).toEqual(systems.map((_, i) => i));
    const stars = nodes.slice(systems.length);
    expect(stars.length).toBeGreaterThan(30);
    const dist = (a: MapNode, b: MapNode) => Math.hypot(a.x - b.x, a.z - b.z);
    for (const star of stars) {
      expect(star.system).toBe(-1);
      for (const system of nodes.slice(0, systems.length)) expect(dist(star, system)).toBeGreaterThanOrEqual(1.5);
    }
  });

  test("connects every star, and no two lanes cross", () => {
    // Connected: a breadth-first search from star 0 reaches all of them.
    const reached = new Set([0]);
    const queue = [0];
    while (queue.length) {
      const current = queue.shift()!;
      for (const lane of lanes) {
        const next = lane.a === current ? lane.b : lane.b === current ? lane.a : -1;
        if (next >= 0 && !reached.has(next)) {
          reached.add(next);
          queue.push(next);
        }
      }
    }
    expect(reached.size).toBe(nodes.length);

    // Two segments cross when each one's ends lie on opposite sides of the
    // other (the sign of a 2D cross product tells the side).
    const side = (p: MapNode, q: MapNode, r: MapNode) => Math.sign((q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x));
    for (const [i, l1] of lanes.entries()) {
      for (const l2 of lanes.slice(i + 1)) {
        if (new Set([l1.a, l1.b, l2.a, l2.b]).size < 4) continue; // sharing a star is fine
        const [a, b, c, d] = [nodes[l1.a]!, nodes[l1.b]!, nodes[l2.a]!, nodes[l2.b]!];
        const crosses = side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
        expect(crosses, `lanes ${l1.a}-${l1.b} and ${l2.a}-${l2.b} cross`).toBe(false);
      }
    }
  });

  test("each empire's systems are joined by its own routes", () => {
    for (const category of new Set(systems.map((s) => s.category))) {
      const members = systems.flatMap((s, i) => (s.category === category ? [i] : []));
      const own = lanes.filter((l) => l.kind === "empire" && l.empire === category);
      const reached = new Set([members[0]!]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const lane of own) {
          if (reached.has(lane.a) !== reached.has(lane.b)) {
            reached.add(lane.a).add(lane.b);
            grew = true;
          }
        }
      }
      for (const member of members) expect(reached.has(member), `${category} system ${member}`).toBe(true);
    }
    expect(lanes.some((l) => l.kind === "border")).toBe(true);
  });
});

describe("label placement", () => {
  const bounds = { width: 600, height: 400 };
  const label = (id: string, x: number, y: number, width = 120): LabelInput => ({ id, x, y, width, height: 24 });

  test("puts a label on the right, or on the left near the right edge", () => {
    const placed = placeLabels([label("a", 100, 100), label("b", 560, 300)], bounds, new Map());
    expect(placed.get("a")).toEqual({ side: "right", collapsed: false });
    expect(placed.get("b")).toEqual({ side: "left", collapsed: false });
  });

  test("moves a label that would cover a more important one", () => {
    // b's star sits just below a's label: b can't go right without overlap.
    const placed = placeLabels([label("a", 100, 100), label("b", 112, 120)], bounds, new Map());
    expect(placed.get("a")!.side).toBe("right");
    expect(placed.get("b")).not.toEqual({ side: "right", collapsed: false });
  });

  test("keeps last frame's side while it still fits (no flickering)", () => {
    const previous = new Map([["a", { side: "left" as const, collapsed: false }]]);
    expect(placeLabels([label("a", 300, 200)], bounds, previous).get("a")!.side).toBe("left");
  });

  test("collapses a label to its dot when there's no room anywhere", () => {
    // Five stars in a tight cross: the middle one, placed last, is boxed in.
    const items = [label("n", 300, 170), label("s", 300, 230), label("e", 360, 200), label("w", 240, 200), label("c", 300, 200)];
    const placed = placeLabels(items, bounds, new Map());
    expect(placed.get("c")!.collapsed).toBe(true);
  });

  test("keeps labels off an obstacle such as the detail panel", () => {
    const panel = { left: 220, top: 0, right: 600, bottom: 400 };
    expect(placeLabels([label("a", 200, 100)], bounds, new Map(), [panel]).get("a")!.side).toBe("left");
  });
});
