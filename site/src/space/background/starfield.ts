// The starfield behind the whole page: one THREE.Points draw call for every
// star, in three depth layers (far, middle, near).
//
// The stars live in screen space, not in the 3D scene: each one has a spot on
// the window (0-1 across, 0-1 down) and a depth. The vertex shader moves it
// when the page scrolls or the mouse moves, near stars more than far ones.
// That difference in speed is parallax, the cue that makes a flat picture
// feel deep (look out of a train window: the fence races, the hills crawl).
// When a star slides off one edge it wraps around to the other (mod()), so
// one window's worth of stars covers a page of any length.
//
// Twinkling is a sine wave over time, with a different speed and starting
// point per star, so they never pulse in sync.
import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, ShaderMaterial } from "three";
import { seededRandom } from "../random";
import type { SharedUniforms } from "./uniforms";

const VERTEX = /* glsl */ `
attribute vec3 aColor;
attribute float aSeed;
uniform vec2 uViewport;
uniform float uPixelRatio;
uniform float uScroll;
uniform vec2 uMouse;
uniform float uTime;
varying vec3 vColor;
varying float vAlpha;

void main() {
  // position.xy: the star's spot on the window (0-1); position.z: its depth,
  // 0 = farthest layer, 1 = nearest.
  float depth = position.z;
  vec2 pixel = position.xy * uViewport;
  // Parallax: far stars move 3% as fast as the page, near ones 22%. The
  // mouse shifts them the other way, a few pixels, like leaning your head.
  pixel.y -= uScroll * mix(0.03, 0.22, depth);
  pixel -= uMouse * mix(2.0, 14.0, depth);
  // Wrap around the edges (with 4px to spare, so stars leave the window
  // completely before reappearing on the other side).
  pixel = mod(pixel + 4.0, uViewport + 8.0) - 4.0;
  // From CSS pixels (y down) to clip space (-1..1, y up), skipping the camera.
  gl_Position = vec4(pixel.x / uViewport.x * 2.0 - 1.0, 1.0 - pixel.y / uViewport.y * 2.0, 0.0, 1.0);

  float size = mix(0.9, 2.2, depth) * mix(0.75, 1.3, fract(aSeed * 7.13));
  // The sprite square is 2.5x the star's size, so its soft edge fits; tiny
  // stars still get at least 2.5 device pixels and are dimmed to match.
  float box = max(size * uPixelRatio * 2.5, 2.5);
  gl_PointSize = box;
  float energy = min(1.0, size * uPixelRatio * 2.5 / box);

  float speed = mix(0.4, 1.7, fract(aSeed * 91.7));
  float twinkle = 0.72 + 0.28 * sin(uTime * speed + aSeed * 60.0);
  vColor = aColor;
  vAlpha = mix(0.3, 1.0, depth) * mix(0.45, 1.0, fract(aSeed * 17.3)) * twinkle * energy;
}
`;

const FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  // A soft round dot in the sprite square, the same as the galaxy's stars
  // (galaxyLayers.ts explains gl_PointCoord and the Gaussian bell).
  vec2 offset = gl_PointCoord - 0.5;
  float d2 = dot(offset, offset) * 4.0;
  float shape = exp(-d2 * 5.0) * max(0.0, 1.0 - d2);
  gl_FragColor = vec4(vColor, vAlpha * shape);
}
`;

// Real stars come in colors set by their temperature: hot ones blue-white,
// the Sun yellow-white, cool ones orange. [r, g, b] in sRGB, with how common
// each one is here.
const STAR_COLORS: Array<{ rgb: [number, number, number]; share: number }> = [
  { rgb: [0.8, 0.87, 1.0], share: 0.3 },
  { rgb: [1.0, 1.0, 1.0], share: 0.35 },
  { rgb: [1.0, 0.95, 0.86], share: 0.2 },
  { rgb: [1.0, 0.83, 0.65], share: 0.12 },
  { rgb: [1.0, 0.72, 0.58], share: 0.03 },
];

/** How many stars for a screen: about one per 420 square CSS pixels. */
export function starCount(lowPower: boolean): number {
  const area = window.screen.width * window.screen.height;
  const count = Math.round(Math.min(4000, Math.max(600, area / 420)));
  return lowPower ? Math.round(count * 0.75) : count;
}

export function createStarfield(shared: SharedUniforms, count: number, seed = 2024) {
  const random = seededRandom(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = random();
    positions[i * 3 + 1] = random();
    // Three layers: 60% far, 30% middle, 10% near, each spread a little.
    const layer = random();
    positions[i * 3 + 2] = layer < 0.6 ? random() * 0.2 : layer < 0.9 ? 0.4 + random() * 0.2 : 0.8 + random() * 0.2;
    // Pick a color by walking the shares until the random number runs out.
    let pick = random();
    const choice = STAR_COLORS.find((c) => (pick -= c.share) < 0) ?? STAR_COLORS[1]!;
    colors.set(choice.rgb, i * 3);
    seeds[i] = random();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new BufferAttribute(colors, 3));
  geometry.setAttribute("aSeed", new BufferAttribute(seeds, 1));
  const material = new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: { ...shared },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const points = new Points(geometry, material);
  // The shader places the stars itself, so Three.js can't tell where they
  // are: don't let it skip the draw for being "off-screen".
  points.frustumCulled = false;
  return {
    points,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
