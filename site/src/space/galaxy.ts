// Generates the stars of a spiral galaxy as plain arrays of numbers, ready to
// hand to the GPU. No Three.js here: it's pure math, so it's unit-tested
// (tests/space.test.ts) and shared by the background (space/background.ts)
// and the project map (space/map.ts).
//
// The shape: stars are placed along `arms` logarithmic-ish spiral arms. Each
// star picks an arm and a distance from the center; the farther out, the more
// the arm has curved around (`spin`). Gaussian scatter makes the arms fuzzy,
// tighter near the core. `t` (0 at the center, 1 at the rim) lets the shader
// color stars warm in the core and cool in the arms, as in real galaxies.
// Learn more: https://en.wikipedia.org/wiki/Spiral_galaxy
import { gaussian, seededRandom } from "./random";

export interface GalaxyOptions {
  count: number; // number of stars
  arms: number; // number of spiral arms
  radius: number; // outer radius, in scene units
  spin: number; // how far an arm winds, in radians at the rim
  scatter: number; // sideways fuzz of an arm, as a fraction of radius
  thickness: number; // vertical fuzz (a galaxy is a thin disc), as a fraction of radius
  seed: number;
}

export interface GalaxyPoints {
  /** x, y, z per star: count * 3 numbers. The disc lies in the x-z plane. */
  positions: Float32Array;
  /** 0 at the center to 1 at the rim, one per star. */
  radial: Float32Array;
  /** A per-star random 0-1 value, for size and twinkle variation in shaders. */
  seeds: Float32Array;
}

export const DEFAULT_GALAXY: GalaxyOptions = {
  count: 60_000,
  arms: 4,
  radius: 10,
  spin: 3.2,
  scatter: 0.11,
  thickness: 0.035,
  seed: 1337,
};

export function generateGalaxy(options: GalaxyOptions): GalaxyPoints {
  const { count, arms, radius, spin, scatter, thickness, seed } = options;
  const random = seededRandom(seed);
  const positions = new Float32Array(count * 3);
  const radial = new Float32Array(count);
  const seeds = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    // Distance from the center. random() ** 1.6 puts more stars near the core.
    const t = random() ** 1.6;
    const r = t * radius;
    const arm = i % arms;
    const angle = (arm / arms) * Math.PI * 2 + t * spin;
    // Scatter shrinks toward the core, where the arms merge into a bulge.
    const spread = scatter * radius * (0.35 + t);
    const x = Math.cos(angle) * r + gaussian(random) * spread;
    const z = Math.sin(angle) * r + gaussian(random) * spread;
    // The core bulges: the disc is thicker in the middle.
    const y = gaussian(random) * thickness * radius * (1.6 - t);

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    radial[i] = Math.min(1, Math.hypot(x, z) / radius);
    seeds[i] = random();
  }
  return { positions, radial, seeds };
}
