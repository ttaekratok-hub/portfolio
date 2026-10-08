// GLSL snippets shared by the background's shaders (sky.ts, galaxyLayers.ts,
// starfield.ts). GLSL is the language of shaders: small programs that run on
// the graphics card (GPU), once per vertex (the vertex shader: where does this
// point go on screen?) and once per pixel (the fragment shader: what color is
// this pixel?). Thousands run in parallel, which is why a GPU can color every
// pixel of the screen sixty times a second.
//
// These are plain strings: Three.js glues them into each shader's source
// before compiling it. The /* glsl */ marker only helps editors highlight
// the code.
// Learn more: https://thebookofshaders.com/01/

/**
 * Random numbers and fbm noise. A shader has no Math.random(): every pixel
 * runs the same code at the same time. Instead it computes "random-looking"
 * numbers from its position with a hash, so the same pixel always gets the
 * same value (deterministic, like the seeded generator in random.ts).
 */
export const HASH_GLSL = /* glsl */ `
// A hash: scrambles a 2D position into a number in [0, 1). Neighboring inputs
// give unrelated outputs. ("Hash without Sine" by Dave Hoskins: no sin(),
// whose precision differs between GPUs.)
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
`;

/** The hash plus smooth noise built from it. Needs FBM_OCTAVES defined. */
export const NOISE_GLSL = /* glsl */ `
${HASH_GLSL}

// Value noise: a random value at every whole-number grid point, smoothly
// blended in between. The result is a soft, blobby pattern instead of the
// TV-static of the raw hash.
float valueNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  // The smoothstep curve 3f^2 - 2f^3 eases in and out of each grid point, so
  // the blend has no visible creases along the grid lines.
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(cell);
  float b = hash12(cell + vec2(1.0, 0.0));
  float c = hash12(cell + vec2(0.0, 1.0));
  float d = hash12(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// fbm, "fractional Brownian motion": several layers (octaves) of noise added
// together, each twice as detailed and half as strong as the one before. Big
// shapes plus smaller and smaller wisps: the recipe behind most procedural
// clouds, smoke, terrain and nebulae. FBM_OCTAVES is set per material (fewer
// octaves = cheaper, softer).
float fbm(vec2 p) {
  float sum = 0.0;
  float amplitude = 0.5;
  // Rotating each octave a little (about 37 degrees) keeps the grid of
  // valueNoise from lining up across octaves, which would show as streaks.
  mat2 turn = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < FBM_OCTAVES; i++) {
    sum += amplitude * valueNoise(p);
    p = turn * p * 2.03 + 17.1;
    amplitude *= 0.5;
  }
  return sum; // roughly 0..1, mostly around 0.5
}
`;

/**
 * Color math. The shaders work with ordinary sRGB numbers (what a hex code
 * like #ffd8a8 means), but "how bright does this look" is measured on linear
 * light: sRGB values are gamma-encoded, so 0.5 is not half as bright as 1.0
 * (it's about 21%). Raising to the power 2.2 is the classic approximation of
 * the conversion.
 */
export const COLOR_GLSL = /* glsl */ `
vec3 toLinear(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }
vec3 toSrgb(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }
// Relative luminance (three.js already has a luminance()), the brightness WCAG's contrast ratio is computed from.
// Green counts most because our eyes are most sensitive to it.
float relativeLuminance(vec3 linearColor) { return dot(linearColor, vec3(0.2126, 0.7152, 0.0722)); }
`;

/**
 * Where the galaxy may shine at full strength. Page text sits right on top
 * of this canvas, and WCAG asks for 4.5:1 contrast: the dark-mode secondary
 * text (#a1a1a6) only gets that over pixels with a luminance under about
 * 0.04, a very dark gray. So the scene keeps the light low wherever text can
 * be, and lets the galaxy glow only in the hero's empty areas (beside and
 * below its text block). background.ts measures those areas on the page and
 * passes them in as rectangles, in CSS pixels from the top-left corner of the
 * window. uZones is 0 when no area is safe (below the hero, or in the calm
 * still frame of Reduce Motion and Pause).
 *
 * Two different tools use openness() below:
 *   - the soft layers (sky, nebula, the galaxy's glow) pass through the
 *     composite's brightness ceiling (sky.ts), a hard guarantee per pixel;
 *   - the sharp layers (the galaxy's stars, the starfield) are drawn after
 *     the composite, at full resolution, so the ceiling never sees them.
 *     Behind text they're thinned out and dimmed instead (galaxyLayers.ts,
 *     starfield.ts): fewer, fainter specks, not a guarantee for every pixel.
 */
export const ZONES_GLSL = /* glsl */ `
uniform vec4 uTextRect; // the hero's text block (padded): left, top, right, bottom
uniform vec4 uHeroRect; // the hero's empty space around it, below the nav
uniform float uTextRamp; // width of the soft edge around the text block, px
uniform float uZones;   // 1: allow the open zones, 0: text-safe everywhere

// Signed distance from point p to a rectangle: negative inside, positive
// outside, in pixels. ("Signed distance functions" are a shader staple: one
// number that says how far you are from a shape's edge.)
float boxDistance(vec2 p, vec4 rect) {
  vec2 d = max(rect.xy - p, p - rect.zw);
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

// 1 where the galaxy may be bright, 0 where text can be, with soft edges so
// the change is never a visible line (a wide one around the text, whose
// bright neighbor is the galaxy's core; narrower on short windows, where the
// space below the text is scarce).
float openness(vec2 cssPixel) {
  float awayFromText = smoothstep(0.0, uTextRamp, boxDistance(cssPixel, uTextRect));
  float insideHero = smoothstep(0.0, 56.0, -boxDistance(cssPixel, uHeroRect));
  return uZones * awayFromText * insideHero;
}
`;
