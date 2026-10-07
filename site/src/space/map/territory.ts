// Empire territories: the colored regions under each category's systems,
// with a brighter border, like the empires on a strategy-game galaxy map.
//
// No outline is ever computed. The whole thing is one flat square on the
// galaxy's plane, and its fragment shader decides, for every pixel, which
// empire owns that spot. Each project system gives off "influence" that fades
// with distance (a Gaussian bump, exp(-d^2 / s^2)); a spot belongs to the
// empire with the most influence there, if it's strong enough. Bumps of
// nearby systems add up and merge into one smooth region, the same idea as
// "metaballs" (blobs that melt together).
// Learn more: https://en.wikipedia.org/wiki/Metaballs
//
// The border is where the influence crosses the threshold. fwidth() tells
// how much a value changes from one pixel to the next, so the border can be
// drawn about 1.5 pixels wide, smooth and sharp at any zoom: the usual way
// to antialias a shape drawn by a formula.
import { Mesh, NormalBlending, PlaneGeometry, ShaderMaterial, Vector3 } from "three";
import type { Category } from "../../data/projects";
import { CATEGORY_ORDER } from "../layout";
import type { MapSystem } from "../types";
import { MAX_SYSTEMS, srgb, type Layer, type SharedUniforms } from "./shared";

const EMPIRES = CATEGORY_ORDER.length;

export function createTerritory(shared: SharedUniforms, systems: MapSystem[], radius: number): Layer {
  // Per system: x, z, and the empire's index, packed into one vec3.
  const packed = Array.from({ length: MAX_SYSTEMS }, (_, i) => {
    const s = systems[i];
    return s ? new Vector3(s.position[0], s.position[2], CATEGORY_ORDER.indexOf(s.category)) : new Vector3();
  });
  const material = new ShaderMaterial({
    uniforms: {
      lit: shared.lit,
      systems: { value: packed },
      count: { value: systems.length },
      empires: { value: CATEGORY_ORDER.map(() => new Vector3()) },
      fill: { value: 1 },
      edge: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vPos;
      void main() {
        vPos = position.xz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      #define MAX_SYSTEMS ${MAX_SYSTEMS}
      #define EMPIRES ${EMPIRES}
      uniform vec3 systems[MAX_SYSTEMS];
      uniform float lit[MAX_SYSTEMS];
      uniform int count;
      uniform vec3 empires[EMPIRES];
      uniform float fill;
      uniform float edge;
      varying vec2 vPos;

      // Each system's reach: influence = exp(-distance^2 / REACH).
      const float REACH = ${(radius * 0.3).toFixed(3)};
      // A spot is claimed where an empire's influence is above THRESHOLD.
      const float THRESHOLD = 0.3;

      void main() {
        float influence[EMPIRES];
        float litSum[EMPIRES];
        for (int e = 0; e < EMPIRES; e++) { influence[e] = 0.0; litSum[e] = 0.0; }
        for (int i = 0; i < MAX_SYSTEMS; i++) {
          if (i >= count) break;
          vec2 d = vPos - systems[i].xy;
          float w = exp(-dot(d, d) / REACH);
          int e = int(systems[i].z + 0.5);
          influence[e] += w;
          litSum[e] += w * lit[i];
        }
        // The strongest empire here, and the runner-up.
        int owner = 0;
        float best = 0.0;
        float second = 0.0;
        for (int e = 0; e < EMPIRES; e++) {
          if (influence[e] > best) { second = best; best = influence[e]; owner = e; }
          else if (influence[e] > second) { second = influence[e]; }
        }
        if (best < THRESHOLD * 0.5) discard; // unclaimed space: draw nothing

        float aa = fwidth(best) * 1.5 + 1e-5;
        float inside = smoothstep(THRESHOLD - aa, THRESHOLD + aa, best);
        float border = 1.0 - smoothstep(0.0, aa, abs(best - THRESHOLD));
        // Where two empires meet, a border line where their influence is equal.
        float lead = best - second;
        float aaLead = fwidth(lead) * 1.5 + 1e-5;
        float front = (1.0 - smoothstep(0.0, aaLead, lead)) * step(THRESHOLD, second);
        // Brighter just inside the border, fading toward the middle.
        float rim = 1.0 - smoothstep(THRESHOLD, THRESHOLD + 0.6, best);
        float alpha = max(inside * fill * (0.35 + 0.65 * rim), max(border, front) * edge);
        // Dimmed by the project filter: how lit this spot is, weighted by
        // which of the owner's systems is closest.
        alpha *= mix(0.18, 1.0, litSum[owner] / best);
        gl_FragColor = vec4(empires[owner], alpha);
      }
    `,
    transparent: true,
    blending: NormalBlending,
    depthTest: false,
    depthWrite: false,
  });
  const geometry = new PlaneGeometry(radius * 2.4, radius * 2.4);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new Mesh(geometry, material);
  mesh.renderOrder = 3;
  return {
    object: mesh,
    setPalette(palette, light) {
      const empires = material.uniforms.empires!.value as Vector3[];
      CATEGORY_ORDER.forEach((category: Category, e) => empires[e]!.copy(srgb(palette.categories[category] ?? "#888")));
      // The fill is a whisper; the border carries the shape.
      material.uniforms.fill!.value = light ? 0.22 : 0.22;
      material.uniforms.edge!.value = light ? 0.75 : 0.7;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
