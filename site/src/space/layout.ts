// Places each project on the project map as a star system. Pure math, no
// Three.js, so it's unit-tested (tests/space.test.ts).
//
// Like empires on a strategy-game galaxy map, each category owns a sector of
// the disc (a slice of the pie), and its projects sit along a short spiral
// inside that sector, strongest first, closest to the core. Positions are
// computed, not random, so the map looks the same on every visit.
import { PROJECTS, type Category, type Project } from "../data/projects";
import type { MapSystem } from "./types";

export const CATEGORY_ORDER: Category[] = ["infrastructure", "networking", "software", "embedded", "techart"];

/** "This Portfolio" -> "this-portfolio": a stable id for links and keys. */
export function slug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function layoutSystems(projects: Project[] = PROJECTS, radius = 10): MapSystem[] {
  const sector = (Math.PI * 2) / CATEGORY_ORDER.length;
  return CATEGORY_ORDER.flatMap((category, c) => {
    // A project appears once, under its first (main) category.
    const members = projects.filter((p) => p.categories[0] === category);
    return members.map((project, k) => {
      // Spread outward from 35% to 85% of the radius, winding slightly
      // with distance like the arms of the galaxy behind them.
      const fraction = members.length === 1 ? 0.55 : 0.35 + (0.5 * k) / (members.length - 1);
      const r = fraction * radius;
      const angle = c * sector + sector * 0.15 + fraction * sector * 0.7;
      return {
        id: slug(project.title),
        title: project.title,
        category,
        position: [Math.cos(angle) * r, 0, Math.sin(angle) * r] as [number, number, number],
      };
    });
  });
}
