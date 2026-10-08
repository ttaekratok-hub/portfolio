// The hero's spiral galaxy, built from three layers that turn together:
//
//   1. stars: the points from galaxy.ts, one THREE.Points draw call. Each star
//      is a "point sprite": the GPU draws a small square facing the camera,
//      and the fragment shader paints a soft round dot into it.
//   2. disc glow: the haze of billions of stars too faint to see one by one.
//      A flat square lying in the galaxy's plane, whose shader recomputes the
//      same spiral arms galaxy.ts uses, with fbm noise for clumps and pink
//      star-forming knots.
//   3. bulge: the bright, round heart of the galaxy. A "billboard": a square
//      that always faces the camera, painted with a soft radial glow.
//
// In dark mode everything uses additive blending: each layer's color is added
// to what's already on screen, the way light adds up, so overlapping stars get
// brighter and never darker. That is how the glow is faked without any
// post-processing. In light mode the galaxy is a pale "daytime ghost", like
// the Moon in a blue sky: normal (alpha) blending, low opacity, cool lavender
// colors (background.ts picks them), its arms carrying the shape and its core
// held back, so it reads as a spiral rather than a bright smudge.
// Learn more: https://threejs.org/docs/#api/en/constants/Materials (blending)
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  type Blending,
} from "three";
import type { GalaxyOptions, GalaxyPoints } from "../galaxy";
import { HASH_GLSL, NOISE_GLSL, ZONES_GLSL } from "./glsl";
import type { SharedUniforms } from "./uniforms";

const STAR_VERTEX = /* glsl */ `
attribute float aRadial; // 0 at the center, 1 at the rim (galaxy.ts)
attribute float aSeed;   // a random 0-1 value per star
uniform vec2 uViewport;
uniform float uPixelRatio;
uniform float uSize;      // a typical star's size in CSS pixels...
uniform float uRefDepth;  // ...at this distance from the camera
uniform float uIntensity; // overall brightness (fades out as the page scrolls)
uniform float uTextKeep;  // share of the stars kept behind text (see below)
uniform float uTextLight; // and how bright those few stay
uniform float uDay;
uniform float uPastel;    // light mode: how far colors are mixed toward white
uniform vec3 uCore;
uniform vec3 uArm;
uniform vec3 uPink;
varying vec3 vColor;
varying float vAlpha;
${HASH_GLSL}
${ZONES_GLSL}

// More random values from the star's one seed. Hashing (seed, k) gives an
// independent-looking number for each k. (Simpler tricks like
// fract(seed * 12.9898) don't: they're sawtooth waves of the same seed, so
// "random" size and brightness would secretly move together.)
float random(float k) {
  return hash12(vec2(aSeed * 4096.0, k));
}

void main() {
  // modelViewMatrix moves the star from the galaxy's own coordinates into
  // the camera's (applying the galaxy's tilt and spin); projectionMatrix
  // then applies perspective. Both are filled in by Three.js.
  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewPosition;

  float r1 = random(1.0);
  float r2 = random(2.0);
  float r3 = random(3.0);
  float r4 = random(4.0);

  // Size: mostly small stars, plus a rare bright giant (1.2% of them). Dividing
  // by the depth is perspective: twice as far looks half as big
  // (viewPosition.z is negative in front of the camera, hence the minus).
  float giant = step(0.988, random(5.0));
  float cssSize = uSize * mix(0.6, 1.4, r1) * (1.0 + 1.5 * giant);
  float pixels = cssSize * uPixelRatio * uRefDepth / -viewPosition.z;
  // The sprite square is 2.5x the star (its soft edge needs room) and at
  // least 2.5 device pixels; a star drawn bigger than it should be is dimmed
  // to match, so tiny far stars don't flicker or look fat. Every pixel of
  // every square costs GPU time (45,000 squares!), so they're kept tight.
  float box = max(pixels * 2.5, 2.5);
  gl_PointSize = box;
  float energy = min(1.0, (pixels * 2.5) / box);

  // Color: warm, old stars in the core, hot blue ones in the arms (aRadial),
  // some whiter, and a few pink ones where new stars are forming.
  vec3 color = mix(uCore, uArm, smoothstep(0.06, 0.55, aRadial));
  color = mix(color, vec3(1.0), 0.35 * r2);
  color = mix(color, uPink, step(0.94, r3) * smoothstep(0.22, 0.45, aRadial) * 0.75);

  // Brightness: the core has tens of thousands of stars on a few hundred
  // pixels, so each one there is much dimmer (or they'd add up to a flat,
  // noisy white patch); the bulge layer provides its glow. Giants shine a
  // little brighter whatever their size.
  float alpha = mix(0.04, 0.95, smoothstep(0.04, 0.4, aRadial)) * mix(0.3, 1.0, max(r1, giant)) * energy;

  // Behind text: thin the stars out and dim the few that remain. These
  // stars are drawn after the composite's brightness ceiling (glsl.ts), so
  // this is what keeps them from sparkling between the letters.
  // gl_Position.xy / w is the star's spot on screen from -1 to 1
  // ("normalized device coordinates"); this converts it to CSS pixels from
  // the top-left, like the page.
  vec2 ndc = gl_Position.xy / gl_Position.w;
  vec2 cssPixel = vec2(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5) * uViewport;
  float open = openness(cssPixel);
  // step(r4, share) is 1 for that share of the stars (r4 is uniform in 0-1),
  // so each star is either kept or hidden: a few clear sparkles look like
  // stars, many faint ones look like dust.
  alpha *= mix(uTextLight, 1.0, open) * step(r4, mix(uTextKeep, 1.0, open));

  vColor = mix(color, vec3(1.0), uPastel * uDay);
  vAlpha = alpha * uIntensity;
}
`;

const STAR_FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  // gl_PointCoord runs 0..1 across the sprite square. d2 is the squared
  // distance from its center: 0 in the middle, 1 at the edge of the circle
  // that fits in the square (squared, because that skips a sqrt()).
  vec2 offset = gl_PointCoord - 0.5;
  float d2 = dot(offset, offset) * 4.0;
  // A Gaussian bell: bright center, smooth falloff, (almost) 0 at the edge.
  float shape = exp(-d2 * 5.0) * max(0.0, 1.0 - d2);
  gl_FragColor = vec4(vColor, vAlpha * shape);
}
`;

const DISC_VERTEX = /* glsl */ `
uniform float uRadius;
varying vec2 vDisc; // position on the disc, in galaxy radii: 0 center, 1 rim
void main() {
  // The square lies in the galaxy's x-z plane (see createGalaxyLayers).
  vDisc = position.xz / uRadius;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const DISC_FRAGMENT = /* glsl */ `
#define TAU 6.28318530718
uniform float uArms;
uniform float uSpin;
uniform float uScatter;
uniform float uIntensity;
uniform float uTextDim;
uniform float uDay;
uniform float uPastel;
uniform vec3 uCore;
uniform vec3 uArm;
uniform vec3 uPink;
uniform vec2 uViewport;
uniform vec2 uSoftSize;
varying vec2 vDisc;
${NOISE_GLSL}
${ZONES_GLSL}

void main() {
  float r = length(vDisc);
  if (r > 1.1) discard; // outside the galaxy: leave the pixel untouched
  float angle = atan(vDisc.y, vDisc.x);

  // galaxy.ts puts arm k's center line at angle = k * TAU / arms + r * spin.
  // Undo the winding (subtract r * spin) and the arms become evenly spaced
  // spokes; fract() then says where we are between two spokes (0 or 1 on
  // one, 0.5 halfway). Times the radius, that's the distance to the arm.
  float spokes = (angle - r * uSpin) / TAU * uArms;
  float across = (fract(spokes + 0.5) - 0.5) * TAU / uArms * r; // signed: which side of the arm
  // Arms widen outward, the same way galaxy.ts scatters its stars; the glow
  // hugs the arm's middle a bit tighter than the stars do.
  float width = uScatter * (0.35 + r) * 0.8;
  // At the very center every direction is "on an arm" (across is 0 there)
  // and the arms' angles bunch up into a sharp pinwheel, so they fade in
  // over the first few percent of the radius; the inner disc takes over.
  float arm = exp(-across * across / (2.0 * width * width)) * smoothstep(0.02, 0.12, r);
  // A dust lane: dark gas along the inner edge of each arm hides some light.
  float laneWidth = 0.35 * width;
  float laneOffset = across + 0.55 * width;
  float lane = exp(-laneOffset * laneOffset / (2.0 * laneWidth * laneWidth));

  // Clumps: fbm on the disc's own coordinates, so they turn with it.
  // Squaring it makes the bright clumps rarer and the gaps darker.
  float clumps = fbm(vDisc * 6.0 + 3.0);
  float rim = 1.0 - smoothstep(0.5, 1.05, r);
  float density = arm * (0.1 + 2.2 * clumps * clumps) * (1.0 - 0.6 * lane);
  density = (density + 0.06) * rim * exp(-1.6 * r);
  density += 0.22 * exp(-r * r / 0.015); // the dense inner disc around the bulge

  vec3 color = mix(uCore, uArm, smoothstep(0.04, 0.5, r));
  // Pink knots of glowing hydrogen where stars are being born, along the arms.
  float knots = smoothstep(0.62, 0.8, fbm(vDisc * 11.0 + 11.0)) * arm * smoothstep(0.18, 0.4, r);
  color = mix(color, uPink, knots * 0.85);

  // Dimmer where page text may be. gl_FragCoord is this pixel's position in
  // the low-resolution picture (y up); convert it to page CSS pixels (y down).
  // As with the stars, the faint arms keep most of their light; the bright
  // inner disc is what gets dimmed. (The composite's ceiling then has the
  // final word, see glsl.ts.)
  vec2 cssPixel = vec2(gl_FragCoord.x, uSoftSize.y - gl_FragCoord.y) / uSoftSize * uViewport;
  float textDim = mix(uTextDim, 0.8, smoothstep(0.12, 0.45, r));
  float strength = uIntensity * mix(textDim, 1.0, openness(cssPixel));

  if (uDay < 0.5) {
    gl_FragColor = vec4(color * density * strength, 1.0); // added to the sky
  } else {
    // By day the color is laid over the sky with an opacity (alpha), so
    // the opacity alone draws the shape. The arms carry it; the core, which
    // has most of the density, is capped at a quarter, so the ghost reads
    // as a spiral and not as a blot under the buttons.
    float arms = arm * (0.2 + 1.6 * clumps * clumps) * (1.0 - 0.5 * lane) * rim * smoothstep(0.04, 0.22, r);
    float core = min(0.25, 0.6 * exp(-r * r / 0.02));
    float opacity = (0.7 * arms + core) * strength;
    gl_FragColor = vec4(mix(color, vec3(1.0), uPastel), min(0.6, opacity));
  }
}
`;

const BULGE_VERTEX = /* glsl */ `
uniform float uSize; // radius of the glow, in scene units
varying vec2 vOffset;
void main() {
  vOffset = position.xy; // -1..1 across the square
  // A billboard: take the galaxy's center in camera space, then offset the
  // corners there, in the camera's own x and y directions. The square then
  // faces the camera from any angle, like a sprite.
  vec4 center = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  center.xy += position.xy * uSize;
  gl_Position = projectionMatrix * center;
}
`;

const BULGE_FRAGMENT = /* glsl */ `
uniform float uIntensity;
uniform float uTextDim;
uniform float uDay;
uniform float uPastel;
uniform vec3 uCore;
uniform vec2 uViewport;
uniform vec2 uSoftSize;
varying vec2 vOffset;
${ZONES_GLSL}
void main() {
  // Squash vertically a little: the bulge is a flattened ball, seen at a tilt.
  vec2 p = vOffset * vec2(1.0, 1.35);
  float d2 = dot(p, p);
  // Three Gaussian bells: a small hot nucleus, a glow around it and a wide,
  // faint halo. Together with the disc and the sky they stay just under 1.0:
  // the low-resolution picture stores 0-1 per channel, and anything brighter
  // would be clipped into a flat white patch.
  float glow = 0.6 * exp(-d2 * 90.0) + 0.2 * exp(-d2 * 12.0) + 0.07 * exp(-d2 * 3.5);
  glow *= 1.0 - smoothstep(0.6, 1.0, sqrt(d2)); // fade out before the square's edge
  // White-hot in the middle (plain white by day), the core color further out.
  vec3 hot = mix(vec3(1.0, 0.96, 0.88), vec3(1.0), uDay);
  vec3 color = mix(hot, uCore, smoothstep(0.0, 0.3, sqrt(d2)));
  vec2 cssPixel = vec2(gl_FragCoord.x, uSoftSize.y - gl_FragCoord.y) / uSoftSize * uViewport;
  float strength = uIntensity * mix(uTextDim, 1.0, openness(cssPixel));
  if (uDay < 0.5) {
    gl_FragColor = vec4(color * glow * strength, 1.0);
  } else {
    // By day: a soft pale glow, never more than a quarter opaque.
    gl_FragColor = vec4(mix(color, vec3(1.0), uPastel), min(0.25, 1.4 * glow * strength));
  }
}
`;

export function createGalaxyLayers(shared: SharedUniforms, galaxy: GalaxyPoints, options: GalaxyOptions) {
  // Uniforms only these layers use. The same { value } objects are listed in
  // several materials, so one assignment updates all of them.
  const colors = {
    uCore: { value: new Color() },
    uArm: { value: new Color() },
    uPink: { value: new Color() },
  };
  const uPastel = { value: 0.4 };
  // How much of the glow's brightness is kept where text may be.
  const glowDim = { value: 0.3 };

  // --- Stars ---
  const starGeometry = new BufferGeometry();
  starGeometry.setAttribute("position", new BufferAttribute(galaxy.positions, 3));
  starGeometry.setAttribute("aRadial", new BufferAttribute(galaxy.radial, 1));
  starGeometry.setAttribute("aSeed", new BufferAttribute(galaxy.seeds, 1));
  const starMaterial = new ShaderMaterial({
    vertexShader: STAR_VERTEX,
    fragmentShader: STAR_FRAGMENT,
    uniforms: {
      ...shared,
      ...colors,
      uPastel,
      uSize: { value: 1.6 },
      uRefDepth: { value: 30 },
      uIntensity: { value: 1 },
      // Behind text: keep 12% of the stars, at 40% of their brightness.
      uTextKeep: { value: 0.12 },
      uTextLight: { value: 0.4 },
    },
    transparent: true,
    depthTest: false, // no depth sorting: with additive light the order doesn't matter
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const stars = new Points(starGeometry, starMaterial);

  // --- Disc glow ---
  const discSize = options.radius * 2.2;
  const discGeometry = new PlaneGeometry(discSize, discSize);
  discGeometry.rotateX(-Math.PI / 2); // a PlaneGeometry stands up (x-y); lay it flat (x-z)
  const discMaterial = new ShaderMaterial({
    vertexShader: DISC_VERTEX,
    fragmentShader: DISC_FRAGMENT,
    defines: { FBM_OCTAVES: 4 },
    uniforms: {
      ...shared,
      ...colors,
      uPastel,
      uTextDim: glowDim,
      uRadius: { value: options.radius },
      uArms: { value: options.arms },
      uSpin: { value: options.spin },
      uScatter: { value: options.scatter },
      uIntensity: { value: 1 },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const disc = new Mesh(discGeometry, discMaterial);

  // --- Bulge ---
  const bulgeGeometry = new PlaneGeometry(2, 2);
  const bulgeMaterial = new ShaderMaterial({
    vertexShader: BULGE_VERTEX,
    fragmentShader: BULGE_FRAGMENT,
    uniforms: {
      ...shared,
      uCore: colors.uCore,
      uPastel,
      uTextDim: glowDim,
      uSize: { value: 1 },
      uIntensity: { value: 1 },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const bulge = new Mesh(bulgeGeometry, bulgeMaterial);
  bulge.frustumCulled = false; // its corners are moved in the shader
  bulge.renderOrder = 1; // over the disc

  // Two nested groups: `tilt` places and tilts the galaxy as a whole,
  // `spin` turns it around its own axis inside that tilt. Rotating a group
  // rotates everything in it, so the three layers always line up.
  const tilt = new Group();
  const spin = new Group();
  tilt.add(spin);
  spin.add(disc, bulge, stars);

  const materials = [starMaterial, discMaterial, bulgeMaterial];
  return {
    tilt,
    spin,
    stars,
    disc,
    bulge,
    colors,
    uniforms: {
      starIntensity: starMaterial.uniforms.uIntensity!,
      starSize: starMaterial.uniforms.uSize!,
      starRefDepth: starMaterial.uniforms.uRefDepth!,
      glowTextDim: glowDim,
      discIntensity: discMaterial.uniforms.uIntensity!,
      bulgeIntensity: bulgeMaterial.uniforms.uIntensity!,
      bulgeSize: bulgeMaterial.uniforms.uSize!,
      pastel: uPastel,
    },
    setBlending(blending: Blending) {
      // Blending is part of the GPU's state for each draw, not of the
      // compiled shader, so switching it costs nothing.
      for (const material of materials) material.blending = blending;
    },
    dispose() {
      starGeometry.dispose();
      discGeometry.dispose();
      bulgeGeometry.dispose();
      for (const material of materials) material.dispose();
    },
  };
}

