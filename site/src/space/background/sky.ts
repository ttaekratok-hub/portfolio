// The two full-screen layers of the background:
//
//   - the sky: deep space with faint nebula clouds in dark mode, a soft
//     daytime sky with drifting clouds in light mode. It's drawn into a small,
//     low-resolution picture (see background.ts), because soft clouds look
//     the same at a third of the resolution and cost a ninth of the work.
//   - the composite: stretches that small picture over the whole window,
//     applies the legibility limits (glsl.ts explains), and adds dithering.
//
// "Full-screen" means a rectangle covering the window. Its vertex shader
// ignores the camera and places the corners at -1..1, which in "clip space"
// (the GPU's own coordinates, after the camera) is exactly the window's edges.
import { Color, Mesh, PlaneGeometry, SRGBColorSpace, ShaderMaterial, type Texture } from "three";
import { COLOR_GLSL, NOISE_GLSL, ZONES_GLSL } from "./glsl";
import type { SharedUniforms } from "./uniforms";

const FULL_SCREEN_VERTEX = /* glsl */ `
varying vec2 vUv; // 0,0 at the bottom-left of the window, 1,1 at the top-right
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec2 uViewport; // window size, CSS pixels
uniform float uTime;    // seconds of animation (frozen when paused)
uniform float uScroll;  // eased page scroll, CSS pixels
uniform float uDay;     // 0: deep space, 1: daytime sky
uniform vec3 uSkyTop;
uniform vec3 uSkyBottom;
uniform vec3 uNebula1;
uniform vec3 uNebula2;
uniform vec3 uNebula3;
uniform vec3 uCloud;
uniform vec3 uSun;
varying vec2 vUv;
${NOISE_GLSL}

// Deep space: near-black with clouds of glowing gas.
vec3 space(vec3 base, vec2 p) {
  // Parallax: the nebula is "far away", so it slides up only 6% as fast as
  // the page scrolls, and drifts on its own very slowly.
  vec2 q = p * 1.35 + vec2(0.0, -0.06 * uScroll / uViewport.y) + uTime * vec2(0.004, 0.0015);
  // Domain warping: look the noise up at a position that is itself pushed
  // around by other noise. Straight fbm looks like fog; warped fbm curls into
  // the swirls and filaments of real nebulae.
  // Learn more: https://iquilezles.org/articles/warp/
  vec2 warp = vec2(fbm(q + vec2(3.1, 1.7)), fbm(q + vec2(8.3, 2.8)));
  float gas = fbm(q + 1.7 * warp);
  // Keep only the densest parts (smoothstep maps 0.42..0.85 to 0..1), so
  // there are clouds with empty space between them instead of a haze.
  float clouds = smoothstep(0.4, 0.8, gas);
  // A very large, slow pattern decides where nebulae exist at all.
  float region = smoothstep(0.25, 0.65, fbm(p * 0.55 + vec2(11.0, 4.0)));
  // Color: blend the three palette colors using two more noise values.
  vec3 color = mix(uNebula1, uNebula2, smoothstep(0.35, 0.7, warp.x));
  color = mix(color, uNebula3, smoothstep(0.55, 0.8, warp.y) * 0.8);
  // Calmer in the middle column, where the text is; richer toward the sides.
  float sides = mix(0.55, 1.0, smoothstep(0.1, 0.45, abs(vUv.x - 0.5)));
  vec3 sky = base + color * clouds * region * sides * 0.42;
  // Vignette: slightly darker corners pull the eye to the center.
  vec2 centered = (vUv - 0.5) * vec2(uViewport.x / uViewport.y, 1.0);
  sky *= 1.0 - 0.45 * smoothstep(0.45, 1.25, length(centered));
  return sky;
}

// Daytime: a light blue sky, a soft sun glow and white clouds.
vec3 day(vec3 base, vec2 p) {
  vec3 sky = base;
  // The sun, out of frame at the top right: a warm brightening there.
  vec2 sunDistance = (vUv - vec2(0.92, 1.08)) * vec2(uViewport.x / uViewport.y, 1.0);
  // (Mixed mostly with white: the sun brightens the sky, never darkens it.)
  sky = mix(sky, mix(uSun, vec3(1.0), 0.75), 0.6 * exp(-dot(sunDistance, sunDistance) * 3.0));
  // Clouds: fbm stretched sideways (real clouds are wider than tall), drifting
  // with the wind and sliding up a little as the page scrolls.
  vec2 q = p * vec2(1.5, 3.2) + vec2(uTime * 0.012, -0.18 * uScroll / uViewport.y);
  vec2 warp = vec2(fbm(q + vec2(5.2, 1.3)), fbm(q + vec2(1.7, 9.2)));
  float density = fbm(q + 0.7 * warp);
  float cover = smoothstep(0.53, 0.68, density);
  // Shading, lit from above: compare the density with a spot slightly
  // higher up. Thinning upward means we're on a cloud's sunny top (white);
  // thickening upward means its underside (a pale blue-gray shadow).
  float above = fbm(q + 0.7 * warp + vec2(0.0, 0.08));
  float lit = clamp(0.6 + (density - above) * 5.0, 0.0, 1.0);
  vec3 shadow = mix(uSkyTop, uCloud, 0.45);
  vec3 cloud = mix(shadow, uCloud, lit);
  return mix(sky, cloud, cover * 0.92);
}

void main() {
  vec3 base = mix(uSkyBottom, uSkyTop, vUv.y);
  // p: position in "window heights", so the noise isn't stretched on wide or
  // tall windows (x runs further than y on a landscape screen).
  vec2 p = vec2(vUv.x * uViewport.x / uViewport.y, vUv.y);
  vec3 color = uDay > 0.5 ? day(base, p) : space(base, p);
  gl_FragColor = vec4(color, 1.0);
}
`;

const COMPOSITE_FRAGMENT = /* glsl */ `
uniform sampler2D uSoft;  // the low-resolution picture: sky + galaxy glow
uniform vec2 uViewport;
uniform float uDay;
uniform float uCeilingText; // max luminance where text can be (dark mode)
uniform float uCeilingOpen; // max luminance in the hero's empty areas
uniform float uFloor;       // min luminance anywhere (light mode)
varying vec2 vUv;
${NOISE_GLSL}
${COLOR_GLSL}
${ZONES_GLSL}

// A soft ceiling: dim values pass almost unchanged, bright ones are pulled
// down smoothly toward the ceiling, never reaching it. A hard min() would
// flatten the core into a disc with a visible edge; this keeps a gradient,
// like the highlight roll-off of a camera (a small cousin of tone mapping).
// At value = ceiling / 3 it removes 5%; at value = ceiling, 29%.
float softCeiling(float value, float ceiling) {
  float x = value / ceiling;
  return value / sqrt(1.0 + x * x);
}

void main() {
  // texture2D samples the picture; the GPU blends the four nearest pixels
  // (linear filtering), so stretching it 3x gives smooth gradients, not blocks.
  vec3 color = texture2D(uSoft, vUv).rgb;
  vec2 cssPixel = vec2(vUv.x, 1.0 - vUv.y) * uViewport;
  vec3 light = toLinear(color);
  float lum = relativeLuminance(light);
  if (uDay < 0.5) {
    // Scaling all three channels by the same factor changes the brightness
    // and keeps the hue: the core stays warm, just dimmer.
    // Blend the two ceilings by ratio, not difference (0.035 -> 0.9 spans
    // 25x): brightness is perceived in ratios, so the change looks even.
    float ceiling = uCeilingText * pow(uCeilingOpen / uCeilingText, openness(cssPixel));
    float limited = softCeiling(lum, ceiling);
    float kept = limited / max(lum, 1e-6); // 1: untouched, less: squeezed
    light *= kept;
    // Squeezed highlights also lose some color: a dimmed warm core would
    // turn brown (dim orange is brown), while a paler one still reads as
    // faint light. A gray of the same luminance keeps the brightness.
    light = mix(vec3(limited), light, mix(0.55, 1.0, kept));
  } else if (lum < uFloor) {
    // Light mode: lift anything darker than the floor toward white, just
    // enough to reach it, so text keeps its contrast on the daytime sky.
    light = mix(light, vec3(1.0), (uFloor - lum) / (1.0 - lum));
  }
  color = toSrgb(light);
  // Dithering: a screen has 256 steps per channel, and a slow dark gradient
  // shows them as visible bands. Adding a tiny, different random amount to
  // every pixel (less than one step) breaks the bands into invisible grain.
  color += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(color, 1.0);
}
`;

/** Turns a CSS color into the plain sRGB numbers (0-1) the shaders use. */
export function srgb(css: string, out = new Color()): Color {
  // setStyle parses the color and converts it into Three.js's linear working
  // space; getRGB converts it back out to sRGB. Our shaders skip Three.js's
  // color management and work in sRGB directly, so a hex code in tokens.css
  // is exactly the color on screen.
  out.setStyle(css);
  out.getRGB(out, SRGBColorSpace);
  return out;
}

export function createSky(shared: SharedUniforms) {
  const geometry = new PlaneGeometry(2, 2);
  const material = new ShaderMaterial({
    vertexShader: FULL_SCREEN_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    defines: { FBM_OCTAVES: 5 },
    uniforms: {
      uViewport: shared.uViewport,
      uTime: shared.uTime,
      uScroll: shared.uScroll,
      uDay: shared.uDay,
      uSkyTop: { value: new Color() },
      uSkyBottom: { value: new Color() },
      uNebula1: { value: new Color() },
      uNebula2: { value: new Color() },
      uNebula3: { value: new Color() },
      uCloud: { value: new Color() },
      uSun: { value: new Color() },
    },
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new Mesh(geometry, material);
  // The corners are placed by the shader, not the camera, so Three.js's
  // "is it in view?" test (frustum culling) would guess wrong: skip it.
  mesh.frustumCulled = false;
  return {
    mesh,
    material,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

export function createComposite(shared: SharedUniforms, soft: Texture) {
  const geometry = new PlaneGeometry(2, 2);
  const material = new ShaderMaterial({
    vertexShader: FULL_SCREEN_VERTEX,
    fragmentShader: COMPOSITE_FRAGMENT,
    defines: { FBM_OCTAVES: 1 },
    uniforms: {
      ...shared,
      uSoft: { value: soft },
      uCeilingText: { value: 0.028 },
      uCeilingOpen: { value: 0.9 },
      uFloor: { value: 0.785 },
    },
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1; // draw first, under the stars
  return {
    mesh,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
