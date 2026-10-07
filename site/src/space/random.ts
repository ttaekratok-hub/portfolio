// A seeded random number generator. Math.random() gives a different galaxy
// on every page load; a seeded generator gives the same sequence every time
// for the same seed, so the galaxy looks the same on every visit, the
// pre-built pieces stay stable, and tests can check exact results.
//
// mulberry32 is a tiny, fast generator with good-enough statistics for
// graphics (not for anything security-related).
// Learn more: https://en.wikipedia.org/wiki/Pseudorandom_number_generator

/** Returns a function that yields numbers in [0, 1), the same sequence for the same seed. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0; // >>> 0 turns any number into an unsigned 32-bit integer
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A normally distributed number (mean 0, standard deviation 1), via the
 * Box-Muller transform. Most values land near 0 and few far away: good for
 * stars bunching along a galaxy arm instead of spreading out evenly.
 */
export function gaussian(random: () => number): number {
  const u = 1 - random(); // (0, 1], so log(u) is finite
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
