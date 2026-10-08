// The backdrop of the project map, three layers drawn before everything else:
//   sky   the background: deep space with faint nebulas, or a daytime sky
//         with soft clouds
//   haze  the galaxy's glow: a bright core and its spiral arms (by day,
//         white wisps like high clouds around a warm, hazy core)
//   dust  thousands of tiny stars, a smaller copy of the hero galaxy (by day,
//         a scattering of white sparkles)
// They're kept quiet on purpose: the project systems drawn on top must stand
// out. By day everything here is drawn *lighter* than the sky or close to it,
// never darker: dark specks on a light sky read as dirt, not stars.
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Mesh,
  NormalBlending,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  Vector3,
} from "three";
import { generateGalaxy } from "../galaxy";
import { GLSL_HASH, GLSL_NOISE, srgb, type Layer, type SharedUniforms } from "./shared";

// ---------- Sky ----------
// A rectangle that always covers the whole canvas. Its vertex shader skips
// the camera entirely: PlaneGeometry(2, 2) spans -1 to 1, which is exactly
// the screen in "clip space" (the coordinates a vertex shader outputs), so
// passing the corners through unchanged fills the screen at any camera angle.
// The clouds (by day) and nebulas (by night) are fbm noise (shared.ts),
// drifting very slowly while the animation runs.
export function createSky(shared: SharedUniforms): Layer {
  const material = new ShaderMaterial({
    uniforms: {
      time: shared.time,
      light: shared.light,
      resolution: shared.resolution,
      top: { value: new Vector3() },
      bottom: { value: new Vector3() },
      glow: { value: new Vector3() },
      glowStrength: { value: 0 },
      cloudA: { value: new Vector3() },
      cloudB: { value: new Vector3() },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform float light;
      uniform vec2 resolution;
      uniform vec3 top;
      uniform vec3 bottom;
      uniform vec3 glow;
      uniform float glowStrength;
      uniform vec3 cloudA;
      uniform vec3 cloudB;
      varying vec2 vUv;
      ${GLSL_HASH}
      ${GLSL_NOISE}
      void main() {
        vec3 color = mix(bottom, top, vUv.y);
        // A soft light in the middle, wider than tall, where the galaxy is.
        vec2 p = (vUv - vec2(0.5, 0.52)) * vec2(1.3, 1.0);
        color = mix(color, glow, glowStrength * exp(-dot(p, p) * 5.0));
        // Two fields of noise, about two and a half blobs per canvas height
        // (dividing by the height keeps them round on any canvas shape).
        vec2 q = gl_FragCoord.xy / resolution.y * 2.4 + vec2(time * 0.012, 0.0);
        float a = smoothstep(0.45, 0.85, fbm(q));
        float b = smoothstep(0.5, 0.9, fbm(q * 0.8 + vec2(31.7, 4.2)));
        // Day: white clouds painted over the blue. Night: faint colored gas
        // added as light.
        color = light > 0.5 ? mix(color, cloudA, max(a, b * 0.7) * 0.75) : color + cloudA * a + cloudB * b;
        // Dithering: +-half a color step of noise per pixel hides banding.
        color += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
  const geometry = new PlaneGeometry(2, 2);
  const mesh = new Mesh(geometry, material);
  // Three.js skips objects outside the camera's view ("frustum culling"),
  // judged from their position in the scene. This one ignores the camera,
  // so that test would be wrong: turn it off.
  mesh.frustumCulled = false;
  mesh.renderOrder = 0;
  return {
    object: mesh,
    setPalette(palette, light) {
      const u = material.uniforms;
      if (light) {
        // Daytime: a deeper, bluer sky than the page's around the map (a
        // window onto the sky; the page's light tint with a little of the
        // arm blue and the teal), so the white clouds and wisps show.
        const blue = srgb(palette.skyTop).lerp(srgb(palette.arm), 0.16).lerp(srgb(palette.nebula[1]), 0.14);
        u.top!.value.copy(blue);
        u.bottom!.value.copy(blue.clone().lerp(srgb(palette.skyBottom), 0.65));
        u.glow!.value.set(1, 1, 1);
        u.glowStrength!.value = 0.15;
        u.cloudA!.value.set(1, 1, 1);
        u.cloudB!.value.set(1, 1, 1);
      } else {
        // Night: near-black, a faint violet light behind the galaxy, and
        // whispers of violet and teal gas (a few percent: added light).
        u.top!.value.copy(srgb(palette.skyTop));
        u.bottom!.value.copy(srgb(palette.skyBottom));
        u.glow!.value.copy(srgb(palette.nebula[0]).multiplyScalar(0.22));
        u.glowStrength!.value = 1;
        u.cloudA!.value.copy(srgb(palette.nebula[0]).multiplyScalar(0.07));
        u.cloudB!.value.copy(srgb(palette.nebula[1]).multiplyScalar(0.045));
      }
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

// ---------- Haze ----------
// A flat square on the galaxy's plane, colored by a formula instead of
// thousands of points: a bright bulge (a Gaussian bump, exp(-r^2)) and a
// disc whose brightness follows the spiral arms, broken up by fbm noise so
// the arms look like dusty, wispy clouds rather than smooth stripes. Being
// on the plane, it tilts and turns with the camera like the stars do.
export function createHaze(shared: SharedUniforms, { radius, arms, spin }: { radius: number; arms: number; spin: number }): Layer {
  const material = new ShaderMaterial({
    uniforms: {
      light: shared.light,
      core: { value: new Vector3() },
      arm: { value: new Vector3() },
      strength: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vPos;
      void main() {
        vPos = position.xz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float light;
      uniform vec3 core;
      uniform vec3 arm;
      uniform float strength;
      varying vec2 vPos;
      ${GLSL_HASH}
      ${GLSL_NOISE}
      void main() {
        float r = length(vPos);
        float bulge = exp(-r * r / 4.0);
        float disc = exp(-r * r / ${(radius * radius * 0.42).toFixed(2)});
        // Brighter along the arms: the same spiral as generateGalaxy, where
        // an arm's angle grows with distance (spin), ${arms} arms apart.
        // Raising the wave to the 4th power sharpens it: narrow bright arms
        // with darker lanes between them, readable at a glance.
        float angle = atan(vPos.y, vPos.x);
        float spiral = 0.5 + 0.5 * cos(${arms.toFixed(1)} * (angle - r / ${radius.toFixed(1)} * ${spin.toFixed(2)}));
        float s2 = spiral * spiral;
        float armGlow = disc * (0.15 + 0.85 * s2 * s2) * (0.45 + 0.75 * fbm(vPos * 0.9));
        if (light > 0.5) {
          // Daytime: white wisps (like high cirrus clouds) around a warm,
          // hazy core, painted over the sky, so alpha is what counts.
          vec3 color = mix(vec3(1.0), core, bulge * 0.65);
          gl_FragColor = vec4(color, clamp(bulge * 0.7 + armGlow * 0.85, 0.0, 1.0) * strength);
        } else {
          // Night: added light (additive blending), so color is what counts.
          gl_FragColor = vec4((core * bulge + arm * armGlow * 1.4) * strength, 1.0);
        }
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const geometry = new PlaneGeometry(radius * 2.4, radius * 2.4);
  geometry.rotateX(-Math.PI / 2); // stand it flat on the x-z plane
  const mesh = new Mesh(geometry, material);
  mesh.renderOrder = 1;
  return {
    object: mesh,
    setPalette(palette, light) {
      material.uniforms.core!.value.copy(srgb(palette.core));
      material.uniforms.arm!.value.copy(srgb(palette.arm));
      material.uniforms.strength!.value = light ? 0.75 : 0.45;
      // Additive blending: each pixel's color is added to what's behind it,
      // so overlapping glows get brighter, like light does. Right for glowing
      // things on black; on a light sky it would wash out to white, so light
      // mode uses normal "paint over" blending instead.
      material.blending = light ? NormalBlending : AdditiveBlending;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

// ---------- Dust ----------
// The stars of the backdrop galaxy as THREE.Points: one vertex per star, and
// the GPU draws each as a small square "point sprite" facing the camera. The
// fragment shader turns the square into a soft round glow, so no texture
// image is needed. All stars are one draw call, which is what makes
// thousands of them cheap.
export function createDust(
  shared: SharedUniforms,
  { count, radius, arms, spin, seed }: { count: number; radius: number; arms: number; spin: number; seed: number },
): Layer {
  const galaxy = generateGalaxy({ count, arms, radius, spin, scatter: 0.12, thickness: 0.03, seed });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(galaxy.positions, 3));
  geometry.setAttribute("radial", new BufferAttribute(galaxy.radial, 1));
  geometry.setAttribute("seed", new BufferAttribute(galaxy.seeds, 1));
  const material = new ShaderMaterial({
    uniforms: {
      time: shared.time,
      light: shared.light,
      pixelRatio: shared.pixelRatio,
      referenceDepth: shared.referenceDepth,
      size: { value: 2.4 },
      opacity: { value: 0.6 },
      core: { value: new Vector3() },
      arm: { value: new Vector3() },
      star: { value: new Vector3() },
    },
    vertexShader: /* glsl */ `
      attribute float radial;
      attribute float seed;
      uniform float time;
      uniform float light;
      uniform float pixelRatio;
      uniform float referenceDepth;
      uniform float size;
      uniform float opacity;
      uniform vec3 core;
      uniform vec3 arm;
      uniform vec3 star;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        // Perspective: a star twice as far away is drawn half as big
        // (-viewPosition.z is the distance in front of the camera). Capped at
        // 1.3x, so zooming in on a system doesn't blow the dust up into blobs.
        float zoom = min(referenceDepth / -viewPosition.z, 1.3);
        float pixels = size * (0.45 + 1.4 * seed * seed) * zoom;
        gl_PointSize = max(pixels, 1.0) * pixelRatio;
        // Warm in the core, cool in the arms, a few plain white ones.
        vColor = mix(core, arm, smoothstep(0.05, 0.55, radial));
        vColor = mix(vColor, star, step(0.9, fract(seed * 13.7)) * 0.6);
        // Twinkle: each star's brightness waves at its own speed and phase.
        float twinkle = 0.7 + 0.3 * sin(time * (0.5 + 1.6 * fract(seed * 7.3)) + seed * 60.0);
        // A star smaller than a pixel would flicker as it moves; draw it at
        // one pixel, dimmer, instead.
        vAlpha = opacity * twinkle * (1.0 - 0.3 * radial) * min(pixels, 1.0);
        // Thin out the bulge, where thousands of points would pile up into
        // grainy "snow": the haze draws the core as a smooth glow instead.
        vAlpha *= mix(0.12, 1.0, smoothstep(0.08, 0.3, radial));
        if (light > 0.5) {
          // Daytime: only one star in three, as white sparkles (lighter than
          // the sky), and none in the core's warm haze.
          vColor = star;
          vAlpha *= step(fract(seed * 31.7), 0.33) * smoothstep(0.12, 0.35, radial);
          gl_PointSize *= 1.4;
        }
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float light;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        if (vAlpha <= 0.0) discard;
        // gl_PointCoord runs from 0 to 1 across the point's square.
        vec2 p = gl_PointCoord - 0.5;
        // Softer by day: a wider, gentler falloff.
        float glow = exp(-dot(p, p) * (light > 0.5 ? 12.0 : 18.0));
        gl_FragColor = vec4(vColor, glow * vAlpha);
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const points = new Points(geometry, material);
  points.renderOrder = 2;
  return {
    object: points,
    setPalette(palette, light) {
      const u = material.uniforms;
      u.core!.value.copy(srgb(palette.core));
      u.arm!.value.copy(srgb(palette.arm));
      u.star!.value.copy(light ? new Vector3(1, 1, 1) : srgb(palette.star));
      // By day the sparkles are painted over the sky; by night the dust is
      // added light.
      u.opacity!.value = light ? 0.34 : 0.7;
      material.blending = light ? NormalBlending : AdditiveBlending;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
