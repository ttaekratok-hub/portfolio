// The backdrop of the project map, three layers drawn before everything else:
//   sky   the background color: deep space, or a soft daytime blue
//   haze  the galaxy's glow: a bright core and faint spiral arms
//   dust  thousands of tiny stars, a smaller copy of the hero galaxy
// They're kept dim on purpose: the project systems drawn on top must stand out.
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
import { GLSL_HASH, srgb, type Layer, type SharedUniforms } from "./shared";

// ---------- Sky ----------
// A rectangle that always covers the whole canvas. Its vertex shader skips
// the camera entirely: PlaneGeometry(2, 2) spans -1 to 1, which is exactly
// the screen in "clip space" (the coordinates a vertex shader outputs), so
// passing the corners through unchanged fills the screen at any camera angle.
export function createSky(): Layer {
  const material = new ShaderMaterial({
    uniforms: {
      top: { value: new Vector3() },
      bottom: { value: new Vector3() },
      glow: { value: new Vector3() },
      glowStrength: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 top;
      uniform vec3 bottom;
      uniform vec3 glow;
      uniform float glowStrength;
      varying vec2 vUv;
      ${GLSL_HASH}
      void main() {
        vec3 color = mix(bottom, top, vUv.y);
        // A soft light in the middle, wider than tall, where the galaxy is.
        vec2 p = (vUv - vec2(0.5, 0.52)) * vec2(1.3, 1.0);
        color = mix(color, glow, glowStrength * exp(-dot(p, p) * 5.0));
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
        // Daytime: the page's sky gradient, a little brighter in the middle.
        u.top!.value.copy(srgb(palette.skyTop));
        u.bottom!.value.copy(srgb(palette.skyBottom));
        u.glow!.value.set(1, 1, 1);
        u.glowStrength!.value = 0.55;
      } else {
        // Night: near-black, with a faint violet light behind the galaxy.
        u.top!.value.copy(srgb(palette.skyTop));
        u.bottom!.value.copy(srgb(palette.skyBottom));
        u.glow!.value.copy(srgb(palette.nebula[0]).multiplyScalar(0.22));
        u.glowStrength!.value = 1;
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
// faint disc whose brightness follows the spiral arms. Being on the plane,
// it tilts and turns with the camera like the stars do.
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
      void main() {
        float r = length(vPos);
        float bulge = exp(-r * r / 2.6);
        float disc = exp(-r * r / ${(radius * radius * 0.42).toFixed(2)});
        // Brighter along the arms: the same spiral as generateGalaxy, where
        // an arm's angle grows with distance (spin), ${arms} arms apart.
        float angle = atan(vPos.y, vPos.x);
        float spiral = 0.5 + 0.5 * cos(${arms.toFixed(1)} * (angle - r / ${radius.toFixed(1)} * ${spin.toFixed(2)}));
        float armGlow = disc * (0.25 + 0.75 * spiral * spiral * spiral);
        vec3 color = core * bulge + arm * armGlow * 1.5;
        float alpha = clamp(bulge * 0.9 + armGlow * 0.5, 0.0, 1.0);
        // Dark mode adds light (additive blending), so color is what counts;
        // light mode paints over the sky, so alpha is what counts.
        gl_FragColor = light > 0.5 ? vec4(mix(arm, core, bulge), alpha * strength) : vec4(color * strength, 1.0);
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
      material.uniforms.strength!.value = light ? 0.55 : 0.3;
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
        // Perspective: a star twice as far away is drawn half as big.
        // -viewPosition.z is the distance in front of the camera.
        float pixels = size * (0.45 + 1.4 * seed * seed) * referenceDepth / -viewPosition.z;
        gl_PointSize = max(pixels, 1.0) * pixelRatio;
        // Warm in the core, cool in the arms, a few plain white ones.
        vColor = mix(core, arm, smoothstep(0.05, 0.55, radial));
        vColor = mix(vColor, star, step(0.9, fract(seed * 13.7)) * 0.6);
        // Twinkle: each star's brightness waves at its own speed and phase.
        float twinkle = 0.7 + 0.3 * sin(time * (0.5 + 1.6 * fract(seed * 7.3)) + seed * 60.0);
        // A star smaller than a pixel would flicker as it moves; draw it at
        // one pixel, dimmer, instead.
        vAlpha = opacity * twinkle * (1.0 - 0.3 * radial) * min(pixels, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        // gl_PointCoord runs from 0 to 1 across the point's square.
        vec2 p = gl_PointCoord - 0.5;
        float glow = exp(-dot(p, p) * 18.0);
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
      u.star!.value.copy(light ? srgb(palette.arm) : srgb(palette.star));
      // By day the dust is a pastel speckle painted over the sky; by night
      // it's added light.
      u.opacity!.value = light ? 0.6 : 0.7;
      material.blending = light ? NormalBlending : AdditiveBlending;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
