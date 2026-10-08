// The stars on the network: the project systems (bright, in their empire's
// color, with a halo) and the unclaimed stars (small and dim). Both are point
// sprites in one THREE.Points, so all of them take a single draw call.
//
// The glow is "faked" in the fragment shader instead of with a bloom
// post-processing pass (which blurs the whole frame several times, too slow
// for phones): each sprite paints a sharp core plus wider, fainter Gaussian
// rings around it. With additive blending (dark mode) overlapping glows add
// up like real light.
// By day the same sprites are painted over the sky as sunlit sparkles: a
// white center, a ring of the empire's color, a pastel halo and a faint
// four-pointed glint, like sunlight catching something shiny.
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
  type WebGLRenderer,
} from "three";
import { seededRandom } from "../random";
import type { MapSystem } from "../types";
import type { MapNetwork } from "./network";
import { MAX_SYSTEMS, srgb, type Layer, type SharedUniforms } from "./shared";

/** Diameter of a project system's sprite (halo included), in CSS pixels. */
const SYSTEM_SIZE = 58;
/** Diameter of an unclaimed star's sprite, in CSS pixels. */
const STAR_SIZE = 9;
/** The selection ring's radius once it has closed in, in scene units (map.ts keeps labels outside it). */
export const RING_RADIUS = 0.5 * 1.15;

export function createStars(
  shared: SharedUniforms,
  network: MapNetwork,
  systems: MapSystem[],
  renderer: WebGLRenderer,
): Layer {
  const { nodes } = network;
  const positions = new Float32Array(nodes.length * 3);
  const system = new Float32Array(nodes.length);
  const seed = new Float32Array(nodes.length);
  const random = seededRandom(99);
  nodes.forEach((node, i) => {
    positions.set([node.x, 0, node.z], i * 3);
    system[i] = node.system;
    seed[i] = random(); // varies size and breathing from star to star
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("system", new BufferAttribute(system, 1));
  geometry.setAttribute("seed", new BufferAttribute(seed, 1));

  // GPUs cap how big a point sprite can be (often 64 to 1024 device pixels;
  // WebGL only promises 1). Ask, and never ask for more.
  const gl = renderer.getContext();
  const maxPointSize = (gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array | null)?.[1] ?? 64;

  const material = new ShaderMaterial({
    uniforms: {
      time: shared.time,
      pixelRatio: shared.pixelRatio,
      referenceDepth: shared.referenceDepth,
      lit: shared.lit,
      light: shared.light,
      colors: { value: Array.from({ length: MAX_SYSTEMS }, () => new Vector3()) },
      starColor: { value: new Vector3() },
      maxPointSize: { value: maxPointSize },
    },
    vertexShader: /* glsl */ `
      #define MAX_SYSTEMS ${MAX_SYSTEMS}
      attribute float system;
      attribute float seed;
      uniform float time;
      uniform float pixelRatio;
      uniform float referenceDepth;
      uniform float lit[MAX_SYSTEMS];
      uniform vec3 colors[MAX_SYSTEMS];
      uniform vec3 starColor;
      uniform float maxPointSize;
      varying vec3 vColor;
      varying float vLit;
      varying float vProject;
      varying float vBreath;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        // How much closer than usual the camera is (zooming in on a system).
        float zoom = clamp(referenceDepth / -viewPosition.z, 0.6, 2.5);
        vProject = step(0.0, system);
        if (vProject > 0.5) {
          int i = int(system + 0.5);
          vColor = colors[i];
          vLit = lit[i];
          // Systems grow only a little when zoomed (sqrt), so they stay crisp.
          gl_PointSize = ${SYSTEM_SIZE.toFixed(1)} * sqrt(zoom) * mix(0.7, 1.0, vLit);
        } else {
          vColor = starColor;
          vLit = 1.0;
          gl_PointSize = ${STAR_SIZE.toFixed(1)} * zoom * (0.75 + 0.5 * seed);
        }
        gl_PointSize = min(gl_PointSize * pixelRatio, maxPointSize);
        // A slow "breathing" of the halo, each star at its own pace.
        vBreath = 0.88 + 0.12 * sin(time * (0.8 + 0.6 * seed) + seed * 40.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float light;
      varying vec3 vColor;
      varying float vLit;
      varying float vProject;
      varying float vBreath;
      void main() {
        // -1 to 1 across the sprite; d is the distance from its center.
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float d = length(p);
        if (d > 1.0) discard;
        float aa = fwidth(d) * 1.2;
        if (vProject < 0.5) {
          if (light > 0.5) {
            // Unclaimed star by day: a white dot with a thin, soft outline in
            // the arm color, so it shows on the pale sky without being a
            // dark speck.
            float dotIn = 1.0 - smoothstep(0.3 - aa, 0.3 + aa, d);
            float outline = 1.0 - smoothstep(0.46 - aa, 0.46 + aa, d);
            gl_FragColor = vec4(mix(vColor, vec3(1.0), dotIn), max(dotIn, outline * 0.4));
            return;
          }
          // Unclaimed star by night: a small soft dot.
          float glow = exp(-d * d * 7.0) * 0.6 + (1.0 - smoothstep(0.2 - aa, 0.2 + aa, d)) * 0.5;
          gl_FragColor = vec4(vColor, glow * 0.9);
          return;
        }
        float dim = mix(0.35, 1.0, vLit);
        float core = 1.0 - smoothstep(0.13 - aa, 0.13 + aa, d);
        float corona = exp(-d * d * 30.0);
        float halo = exp(-d * d * 4.5) * 0.55 * vBreath;
        if (light > 0.5) {
          // Daytime, painted over the sky (normal blending), back to front:
          // a pastel halo (the empire color mixed with white), a faint
          // white glint (two thin Gaussian streaks, across and up), a ring
          // in the empire color, and a white center.
          float white = 1.0 - smoothstep(0.1 - aa, 0.1 + aa, d);
          float ring = 1.0 - smoothstep(0.18 - aa, 0.18 + aa, d);
          float glint = (exp(-abs(p.y) * 22.0) + exp(-abs(p.x) * 22.0)) * (1.0 - smoothstep(0.05, 0.7, d)) * 0.9;
          vec3 color = mix(vColor, vec3(1.0), 0.4);
          float alpha = exp(-d * d * 5.0) * 0.75 * vBreath;
          color = mix(color, vec3(1.0), glint);
          alpha = max(alpha, glint);
          color = mix(color, vColor, ring);
          alpha = max(alpha, ring);
          color = mix(color, vec3(1.0), white);
          gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0) * dim);
        } else {
          // Night: a white-hot core in a colored corona and halo, added as light.
          vec3 color = vColor * (corona * 1.1 + halo) + vec3(core);
          gl_FragColor = vec4(color * dim, 1.0);
        }
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const points = new Points(geometry, material);
  points.renderOrder = 6;
  return {
    object: points,
    setPalette(palette, light) {
      const colors = material.uniforms.colors!.value as Vector3[];
      systems.forEach((s, i) => colors[i]!.copy(srgb(palette.categories[s.category] ?? palette.star)));
      material.uniforms.starColor!.value.copy(srgb(light ? palette.arm : palette.star));
      material.blending = light ? NormalBlending : AdditiveBlending;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

// ---------- Selection ring ----------
// A ring lying flat on the galaxy's plane around the selected system, so it
// tilts with the map, plus a wave that keeps rippling outward while the
// animation runs. Drawn by formula on a small square, like the territories.
export interface SelectionRing extends Layer {
  /** Center the ring on a system, in its empire color, or hide it (null). */
  show(position: [number, number, number] | null, color: string | null): void;
  /** 0 = hidden, 1 = fully shown; map.ts eases it in. */
  setAppear(value: number): void;
}

export function createSelectionRing(shared: SharedUniforms): SelectionRing {
  const material = new ShaderMaterial({
    uniforms: {
      time: shared.time,
      light: shared.light,
      color: { value: new Vector3(1, 1, 1) },
      appear: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv * 2.0 - 1.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform float light;
      uniform vec3 color;
      uniform float appear;
      varying vec2 vUv;
      void main() {
        float r = length(vUv);
        float aa = fwidth(r) * 1.5;
        // The ring, with four gaps that slowly turn (like a targeting bracket).
        float radius = mix(0.9, 0.5, appear); // it closes in as it appears
        float ring = 1.0 - smoothstep(0.035 - aa, 0.035 + aa, abs(r - radius));
        float angle = atan(vUv.y, vUv.x) + time * 0.25;
        ring *= smoothstep(0.55, 0.7, abs(cos(angle * 2.0)));
        // The wave: every 2.5 seconds a thin circle grows from the ring and fades.
        float wave = fract(time * 0.4);
        float waveRing = (1.0 - smoothstep(0.0, 0.02 + aa, abs(r - (0.5 + wave * 0.45)))) * (1.0 - wave);
        float alpha = (ring + waveRing * 0.55) * appear;
        gl_FragColor = light > 0.5 ? vec4(color, alpha) : vec4(color * alpha, 1.0);
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const geometry = new PlaneGeometry(2, 2);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new Mesh(geometry, material);
  mesh.renderOrder = 5;
  mesh.visible = false;
  mesh.scale.setScalar(1.15);
  let active = false;
  return {
    object: mesh,
    show(position, color) {
      active = !!position;
      if (position) mesh.position.set(position[0], position[1], position[2]);
      if (color) material.uniforms.color!.value.copy(srgb(color));
      mesh.visible = active && material.uniforms.appear!.value > 0;
    },
    setAppear(value) {
      material.uniforms.appear!.value = value;
      mesh.visible = active && value > 0;
    },
    setPalette(_palette, light) {
      material.blending = light ? NormalBlending : AdditiveBlending;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
