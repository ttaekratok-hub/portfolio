// The two full-screen layers of the background:
//
//   - the sky: deep space with faint nebula clouds. It's drawn into a small,
//     low-resolution picture (see background.ts), because soft clouds look
//     the same at a third of the resolution and cost a ninth of the work.
//   - the composite: stretches that small picture over the whole window,
//     applies the legibility limits (glsl.ts explains), and adds dithering.
//
// "Full-screen" means a rectangle covering the window. Its vertex shader
// ignores the camera and places the corners at -1..1, which in "clip space"
// (the GPU's own coordinates, after the camera) is exactly the window's edges.
import { Color, Mesh, PlaneGeometry, SRGBColorSpace, ShaderMaterial, type Texture } from "three";
import { COLOR_GLSL, HASH_GLSL, NOISE_GLSL, ZONES_GLSL } from "./glsl";
import type { SharedUniforms } from "./uniforms";

const FULL_SCREEN_VERTEX = /* glsl */ `
varying vec2 vUv; // 0,0 at the bottom-left of the window, 1,1 at the top-right
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec2 uViewport; // canvas size, CSS pixels
uniform vec2 uLayout;   // the steady size things are laid out on (uniforms.ts)
uniform float uTime;    // seconds of animation (frozen when paused)
uniform float uScroll;  // eased page scroll, CSS pixels
uniform vec3 uSkyTop;
uniform vec3 uSkyBottom;
uniform vec3 uNebula1;
uniform vec3 uNebula2;
uniform vec3 uNebula3;
varying vec2 vUv;
${NOISE_GLSL}

// Deep space: near-black with clouds of glowing gas.
vec3 space(vec3 base, vec2 p) {
  // Parallax: the nebula is "far away", so it slides up only 6% as fast as
  // the page scrolls, and drifts on its own very slowly.
  vec2 q = p * 1.35 - vec2(0.0, 0.06 * uScroll / uLayout.y) + uTime * vec2(0.004, 0.0015);
  // Domain warping: look the noise up at a position that is itself pushed
  // around by other noise. Straight fbm looks like fog; warped fbm curls into
  // the swirls and filaments of real nebulae.
  // Learn more: https://iquilezles.org/articles/warp/
  vec2 warp = vec2(fbm(q + vec2(3.1, 1.7)), fbm(q + vec2(8.3, 2.8)));
  float gas = fbm(q + 1.7 * warp);
  // Keep only the densest parts (smoothstep maps 0.4..0.8 to 0..1), so
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

void main() {
  // The pixel in CSS pixels from the top-left, then measured in "layout
  // heights" from the top: anchored at the top of the screen (where a phone's
  // toolbar doesn't change anything) and not stretched on wide or tall
  // windows, since x and y use the same unit.
  vec2 css = vec2(vUv.x, 1.0 - vUv.y) * uViewport;
  vec2 p = vec2(css.x, uLayout.y - css.y) / uLayout.y;
  vec3 base = mix(uSkyBottom, uSkyTop, p.y); // p.y: 1 at the top, 0 at the bottom
  gl_FragColor = vec4(space(base, p), 1.0);
}
`;

const COMPOSITE_FRAGMENT = /* glsl */ `
uniform sampler2D uSoft;  // the low-resolution picture: sky + galaxy glow
uniform vec2 uViewport;
uniform float uMoreContrast;
uniform float uCeilingText; // max luminance where text can be
uniform float uCeilingOpen; // max luminance in the hero's empty areas
varying vec2 vUv;
${HASH_GLSL}
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
  float open = openness(cssPixel);
  vec3 light = toLinear(color);
  float lum = relativeLuminance(light);
  // Scaling all three channels by the same factor changes the brightness
  // and keeps the hue: the core stays warm, just dimmer.
  // Blend the two ceilings by ratio, not difference (0.028 -> 0.9 spans
  // 32x): brightness is perceived in ratios, so the change looks even.
  // With "more contrast" asked for, the text areas get 40% less light.
  float textCeiling = uCeilingText * (1.0 - 0.4 * uMoreContrast);
  float ceiling = textCeiling * pow(uCeilingOpen / textCeiling, open);
  float limited = softCeiling(lum, ceiling);
  float kept = limited / max(lum, 1e-6); // 1: untouched, less: squeezed
  light *= kept;
  // Squeezed highlights also lose some color: a dimmed warm core would
  // turn brown (dim orange is brown), while a paler one still reads as
  // faint light. A gray of the same luminance keeps the brightness.
  light = mix(vec3(limited), light, mix(0.55, 1.0, kept));
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
      ...shared,
      uSkyTop: { value: new Color() },
      uSkyBottom: { value: new Color() },
      uNebula1: { value: new Color() },
      uNebula2: { value: new Color() },
      uNebula3: { value: new Color() },
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
    uniforms: {
      ...shared,
      uSoft: { value: soft },
      // #a1a1a6 text needs a background luminance under 0.041 for 4.5:1;
      // 0.028 leaves room for the sharp stars drawn on top.
      uCeilingText: { value: 0.028 },
      uCeilingOpen: { value: 0.9 },
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
