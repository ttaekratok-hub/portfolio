// The hyperlane network of the project map: pure math, no Three.js, so it's
// unit-tested (tests/map.test.tsx).
//
// On a strategy-game galaxy map, stars aren't scattered at random: they're
// joined by "hyperlanes", short routes that never cross, and empires sit on
// that network. This file builds one around the project systems:
//
//   1. Unclaimed stars. Small, dim stars that make the map feel like a galaxy
//      rather than eight dots. Candidates come from the same spiral as the
//      galaxy backdrop (generateGalaxy), and a candidate is kept only if it
//      isn't too close to a star already placed: a cheap version of "Poisson
//      disc sampling", which spreads points evenly without a grid look.
//   2. Lanes. A "relative neighborhood graph" (RNG): two stars are linked
//      unless some third star is closer to both of them than they are to
//      each other. It links near neighbors only, its lines never cross, and
//      it always connects every star (it contains the minimum spanning tree).
//      Learn more: https://en.wikipedia.org/wiki/Relative_neighborhood_graph
//   3. Routes. The lanes an empire actually uses: within each category, a
//      path from each project to the next (in layout order, strongest first),
//      plus one "border" route between each pair of neighboring empires.
//      Each path is the shortest way through the network, found with
//      Dijkstra's algorithm, so routes follow the hyperlanes instead of
//      cutting across the map.
//      Learn more: https://en.wikipedia.org/wiki/Dijkstra%27s_algorithm
//   4. Claims (claimTerritory, below). Which stars each empire holds: its
//      own project systems, the stars along its routes, and the unclaimed
//      stars a lane or two away from its systems. territory.ts draws each
//      empire's region around the stars it holds, so the regions follow the
//      hyperlanes and meet their neighbors at shared borders, as on a
//      strategy map, instead of floating as one circle per project.
import type { Category } from "../../data/projects";
import { generateGalaxy } from "../galaxy";
import { CATEGORY_ORDER } from "../layout";
import type { MapSystem } from "../types";

export interface MapNode {
  x: number;
  z: number;
  /** Index into the systems array for a project system, -1 for an unclaimed star. */
  system: number;
}

export interface Lane {
  /** Node indices of the two ends. */
  a: number;
  b: number;
  /** neutral: an ordinary hyperlane; empire: a route inside one category; border: between two. */
  kind: "neutral" | "empire" | "border";
  /** For routes: the category whose color it takes (border routes take the first). */
  empire?: Category;
  /** For routes: the two project systems (indices into systems) the route joins. */
  ends?: [number, number];
}

export interface MapNetwork {
  nodes: MapNode[];
  lanes: Lane[];
}

export interface NetworkOptions {
  /** How many unclaimed stars to add. */
  stars: number;
  /** The disc radius, as in layoutSystems. */
  radius?: number;
  seed?: number;
}

const dist = (p: MapNode, q: MapNode) => Math.hypot(p.x - q.x, p.z - q.z);

export function buildNetwork(systems: MapSystem[], { stars, radius = 10, seed = 4242 }: NetworkOptions): MapNetwork {
  const nodes: MapNode[] = systems.map((s, i) => ({ x: s.position[0], z: s.position[2], system: i }));

  // 1. Unclaimed stars, spaced out: farther from project systems (whose
  // glow and label need room) than from each other. The bright core (inner
  // 16%) stays empty, as on most strategy maps.
  const candidates = generateGalaxy({ count: stars * 14, arms: 4, radius, spin: 3.2, scatter: 0.16, thickness: 0, seed });
  for (let i = 0; i < candidates.radial.length && nodes.length < systems.length + stars; i++) {
    const node = { x: candidates.positions[i * 3]!, z: candidates.positions[i * 3 + 2]!, system: -1 };
    const r = Math.hypot(node.x, node.z);
    if (r < radius * 0.16 || r > radius * 0.97) continue;
    const crowded = nodes.some((other) => dist(node, other) < (other.system >= 0 ? radius * 0.15 : radius * 0.105));
    if (!crowded) nodes.push(node);
  }

  // 2. The relative neighborhood graph. Three nested loops over ~70 stars is
  // a few hundred thousand distance checks: instant, and done once.
  const n = nodes.length;
  const d = nodes.map((p) => nodes.map((q) => dist(p, q)));
  const lanes: Lane[] = [];
  const laneIndex = new Map<string, number>(); // "a-b" (a < b) -> index in lanes
  const neighbors: number[][] = nodes.map(() => []);
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const ab = d[a]![b]!;
      if (ab > radius * 0.5) continue; // no lanes across half the galaxy
      let blocked = false;
      for (let c = 0; c < n && !blocked; c++) {
        if (c !== a && c !== b && Math.max(d[a]![c]!, d[b]![c]!) < ab) blocked = true;
      }
      if (blocked) continue;
      laneIndex.set(`${a}-${b}`, lanes.length);
      lanes.push({ a, b, kind: "neutral" });
      neighbors[a]!.push(b);
      neighbors[b]!.push(a);
    }
  }

  // Dijkstra: the shortest path from one node to another along the lanes.
  // With this few nodes, the simple version (scan for the closest unvisited
  // node each step, no priority queue) is plenty.
  function shortestPath(from: number, to: number): number[] {
    const cost = new Array<number>(n).fill(Infinity);
    const previous = new Array<number>(n).fill(-1);
    const done = new Array<boolean>(n).fill(false);
    cost[from] = 0;
    for (;;) {
      let current = -1;
      for (let i = 0; i < n; i++) if (!done[i] && (current < 0 || cost[i]! < cost[current]!)) current = i;
      if (current < 0 || cost[current] === Infinity || current === to) break;
      done[current] = true;
      for (const next of neighbors[current]!) {
        const through = cost[current]! + d[current]![next]!;
        if (through < cost[next]!) {
          cost[next] = through;
          previous[next] = current;
        }
      }
    }
    const path = [to];
    while (path[0] !== from && previous[path[0]!]! >= 0) path.unshift(previous[path[0]!]!);
    return path[0] === from ? path : [];
  }

  // 3. Routes: mark the lanes along each path. An empire route wins over a
  // border route that happens to share a lane.
  function route(from: number, to: number, kind: "empire" | "border", empire: Category) {
    const path = shortestPath(from, to);
    for (let i = 1; i < path.length; i++) {
      const [a, b] = [Math.min(path[i - 1]!, path[i]!), Math.max(path[i - 1]!, path[i]!)];
      const lane = lanes[laneIndex.get(`${a}-${b}`)!]!;
      if (lane.kind === "empire") continue;
      Object.assign(lane, { kind, empire, ends: [from, to] });
    }
  }
  // Node i is system i for the first systems.length nodes, so system
  // indices double as node indices here.
  const members = CATEGORY_ORDER.map((category) =>
    systems.flatMap((s, i) => (s.category === category ? [i] : [])),
  );
  // Border routes first, so empire routes overwrite them where they overlap.
  members.forEach((group, c) => {
    const nextGroup = members[(c + 1) % members.length]!;
    if (!group.length || !nextGroup.length || nextGroup === group) return;
    // The closest pair of systems between two neighboring empires.
    let best: [number, number] = [group[0]!, nextGroup[0]!];
    for (const a of group) for (const b of nextGroup) if (d[a]![b]! < d[best[0]]![best[1]]!) best = [a, b];
    route(best[0], best[1], "border", CATEGORY_ORDER[c]!);
  });
  members.forEach((group, c) => {
    for (let k = 1; k < group.length; k++) route(group[k - 1]!, group[k]!, "empire", CATEGORY_ORDER[c]!);
  });

  return { nodes, lanes };
}

// ---------- Claims ----------

export interface Claim {
  /** The claimed star (index into nodes). */
  node: number;
  /**
   * The project system (index into systems) the claim belongs to: its empire
   * owns the star, and the star dims with it when the filter hides it.
   */
  system: number;
  /** How strongly it's held: 1 for a project system, less for the stars around it. */
  weight: number;
}

/** Claim strengths: a project, a star on one of its empire's routes, a star 1 or 2 lanes away. */
export const CLAIM_WEIGHT = { system: 1, route: 0.8, near: 0.62, far: 0.48 } as const;

/**
 * Which stars each empire holds. Every star goes to the project system
 * nearest to it *along the lanes* (not as the crow flies), found with a
 * "multi-source" Dijkstra: the search starts from all project systems at
 * once, so each star is reached first from its nearest one. Stars more than
 * two lanes from any project, or out near the rim, stay unclaimed. Stars on
 * an empire's own routes always belong to that empire, which joins its
 * systems into one region. Strongest claims first.
 */
export function claimTerritory(
  network: MapNetwork,
  systemCount: number,
  { radius = 10, maxHops = 2 }: { radius?: number; maxHops?: number } = {},
): Claim[] {
  const { nodes, lanes } = network;
  const n = nodes.length;
  const neighbors: Array<Array<{ to: number; length: number }>> = nodes.map(() => []);
  for (const lane of lanes) {
    const length = dist(nodes[lane.a]!, nodes[lane.b]!);
    neighbors[lane.a]!.push({ to: lane.b, length });
    neighbors[lane.b]!.push({ to: lane.a, length });
  }
  const cost = new Array<number>(n).fill(Infinity);
  const hops = new Array<number>(n).fill(Infinity);
  const source = new Array<number>(n).fill(-1);
  const done = new Array<boolean>(n).fill(false);
  for (let i = 0; i < systemCount; i++) {
    cost[i] = 0;
    hops[i] = 0;
    source[i] = i;
  }
  for (;;) {
    let current = -1;
    for (let i = 0; i < n; i++) if (!done[i] && cost[i]! < Infinity && (current < 0 || cost[i]! < cost[current]!)) current = i;
    if (current < 0) break;
    done[current] = true;
    for (const { to, length } of neighbors[current]!) {
      if (cost[current]! + length < cost[to]!) {
        cost[to] = cost[current]! + length;
        hops[to] = hops[current]! + 1;
        source[to] = source[current]!;
      }
    }
  }

  const claims: Claim[] = [];
  const claimed = new Set<number>();
  for (let i = 0; i < systemCount; i++) {
    claims.push({ node: i, system: i, weight: CLAIM_WEIGHT.system });
    claimed.add(i);
  }
  // Stars on an empire's routes, held by the nearer of the route's two ends.
  for (const lane of lanes) {
    if (lane.kind !== "empire" || !lane.ends) continue;
    for (const node of [lane.a, lane.b]) {
      if (claimed.has(node)) continue;
      const [p, q] = lane.ends;
      const system = dist(nodes[node]!, nodes[p]!) <= dist(nodes[node]!, nodes[q]!) ? p : q;
      claims.push({ node, system, weight: CLAIM_WEIGHT.route });
      claimed.add(node);
    }
  }
  // The stars around each project, within reach and inside the rim.
  for (let node = systemCount; node < n; node++) {
    if (claimed.has(node) || source[node]! < 0 || hops[node]! > maxHops) continue;
    if (Math.hypot(nodes[node]!.x, nodes[node]!.z) > radius * 0.86) continue;
    claims.push({ node, system: source[node]!, weight: hops[node] === 1 ? CLAIM_WEIGHT.near : CLAIM_WEIGHT.far });
  }
  return claims.sort((a, b) => b.weight - a.weight);
}
