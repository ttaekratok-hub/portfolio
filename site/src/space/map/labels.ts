// The words on the project map and where its labels go. No Three.js here:
// GalaxyMap.tsx (in the main bundle) uses it, and tests/map.test.tsx tests it.
import { FILTERS, PROJECTS, type Category, type Filter, type Project } from "../../data/projects";
import { slug } from "../layout";

/** Every project by its map id (the slug of its title, also the card's id). */
export const PROJECT_BY_ID: ReadonlyMap<string, Project> = new Map(PROJECTS.map((p) => [slug(p.title), p]));

/**
 * Shorter names for the map's labels, where the full title would crowd it.
 * Each is a piece of the full title on purpose: a button's visible text must
 * be part of its accessible name (WCAG 2.5.3 "Label in Name"), so someone
 * using voice control can say "click Kubernetes Platform" and hit it.
 */
const SHORT_LABELS: Record<string, string> = {
  "production-linux-kubernetes-platform": "Kubernetes Platform",
  "mikrotik-ospf-network-lab": "OSPF Network Lab",
  "public-issue-reporting-app": "Issue-Reporting App",
  "stm32-real-time-line-following-robot": "Line-Following Robot",
  "space-scene-galaxy-map": "Space Scene",
};

export function shortLabel(id: string, title: string): string {
  return SHORT_LABELS[id] ?? title;
}

const CATEGORY_LABEL = new Map<Filter, string>(FILTERS.map((f) => [f.id, f.label]));

/** "Cloud & DevOps", or "Cloud & DevOps and Software" for a project in two. */
export function categoryNames(categories: Category[]): string {
  return categories.map((c) => CATEGORY_LABEL.get(c) ?? c).join(" and ");
}

/** Whether a project shows under the current filter (any of its categories counts). */
export function matchesFilter(id: string, filter: Filter): boolean {
  if (filter === "all") return true;
  return PROJECT_BY_ID.get(id)?.categories.includes(filter) ?? false;
}

// ---------- Label placement ----------
//
// Each label sits next to its star: right, left, above or below. Labels move
// as the map turns, so the placement is chosen again on every frame, with
// three rules:
//   - Greedy order: the most important labels (the selected one, then the
//     ones nearest the camera) choose first; later ones avoid them. Not the
//     best possible layout, but fast, stable and good enough for a few dozen.
//   - Hysteresis: keep the current spot as long as it still fits. Without
//     it, a label near a tie would flip back and forth every frame.
//   - Collapse: a label with no free spot shrinks to its color dot (its
//     button stays, full size; the text shows again on hover or focus).
// The gaps here match the paddings in styles/map.css.

export type Side = "right" | "left" | "above" | "below";

export interface Placement {
  side: Side;
  /** No room for the text: show only the label's color dot. */
  collapsed: boolean;
}

export interface LabelInput {
  id: string;
  /** The star's position, in CSS pixels inside the map. */
  x: number;
  y: number;
  /** The label's measured size, in CSS pixels. */
  width: number;
  height: number;
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** How far a label's near edge sits from its star's center, beside it. */
export const SIDE_GAP = 12;
/** The same, above or below the star. */
export const STACK_GAP = 10;
/** A collapsed label's width: just the color dot and its padding. */
export const COLLAPSED_WIDTH = 24;

const SIDES: Side[] = ["right", "left", "above", "below"];

function labelRect(x: number, y: number, width: number, height: number, side: Side): Rect {
  switch (side) {
    case "right":
      return { left: x + SIDE_GAP, right: x + SIDE_GAP + width, top: y - height / 2, bottom: y + height / 2 };
    case "left":
      return { left: x - SIDE_GAP - width, right: x - SIDE_GAP, top: y - height / 2, bottom: y + height / 2 };
    case "above":
      return { left: x - width / 2, right: x + width / 2, top: y - STACK_GAP - height, bottom: y - STACK_GAP };
    case "below":
      return { left: x - width / 2, right: x + width / 2, top: y + STACK_GAP, bottom: y + STACK_GAP + height };
  }
}

function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Places each label, in the order given (most important first). `previous`
 * holds last frame's placements; the result replaces it. `obstacles` are
 * areas to keep clear (the detail panel).
 */
export function placeLabels(
  items: LabelInput[],
  bounds: { width: number; height: number },
  previous: ReadonlyMap<string, Placement>,
  obstacles: Rect[] = [],
): Map<string, Placement> {
  const margin = 6;
  // The stars themselves are obstacles too: a label shouldn't hide another
  // system's star.
  const stars = items.map((item) => ({ left: item.x - 8, right: item.x + 8, top: item.y - 8, bottom: item.y + 8 }));
  const placed: Rect[] = [];
  const result = new Map<string, Placement>();

  for (const [i, item] of items.entries()) {
    // The cost of a spot: how much of the label would be cut off by the
    // map's edge or covered by labels and stars already placed, in square
    // pixels. 0 is a perfect fit.
    const cost = (rect: Rect) => {
      const w = rect.right - rect.left;
      const h = rect.bottom - rect.top;
      let total =
        (Math.max(0, margin - rect.left) + Math.max(0, rect.right - (bounds.width - margin))) * h +
        (Math.max(0, margin - rect.top) + Math.max(0, rect.bottom - (bounds.height - margin))) * w;
      for (const other of placed) total += overlap(rect, other);
      // Covering an obstacle counts four times: better to collapse a label
      // than to tuck it under the panel.
      for (const other of obstacles) total += overlap(rect, other) * 4;
      stars.forEach((star, j) => {
        if (j !== i) total += overlap(rect, star);
      });
      return total;
    };
    // Try last frame's spot first, then the side facing the map's middle.
    const before = previous.get(item.id);
    const facing: Side = item.x > bounds.width * 0.62 ? "left" : "right";
    const order = [...new Set<Side>([before?.side ?? facing, facing, ...SIDES])];
    let best = { side: order[0]!, cost: Infinity, rect: labelRect(item.x, item.y, item.width, item.height, order[0]!) };
    for (const side of order) {
      const rect = labelRect(item.x, item.y, item.width, item.height, side);
      const c = cost(rect);
      if (c < best.cost) best = { side, cost: c, rect };
      if (c === 0) break;
    }
    // Too crowded: collapse to the dot. An open label tolerates a little
    // overlap before collapsing, and a collapsed one opens only when it fits
    // cleanly, so a label at the threshold doesn't blink.
    const tolerance = item.width * item.height * (!before ? 0.05 : before.collapsed ? 0.01 : 0.12);
    if (best.cost > tolerance) {
      let dot = { side: best.side, cost: Infinity, rect: best.rect };
      for (const side of order) {
        const rect = labelRect(item.x, item.y, COLLAPSED_WIDTH, item.height, side);
        const c = cost(rect);
        if (c < dot.cost) dot = { side, cost: c, rect };
        if (c === 0) break;
      }
      result.set(item.id, { side: dot.side, collapsed: true });
      placed.push(dot.rect);
    } else {
      result.set(item.id, { side: best.side, collapsed: false });
      placed.push(best.rect);
    }
  }
  return result;
}
