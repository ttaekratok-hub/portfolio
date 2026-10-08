// Empire territories: the colored regions under each category's systems,
// with a bright border and a glowing band just inside it, like the empires
// on a strategy-game galaxy map.
//
// No outline is ever computed. The whole thing is one flat square on the
// galaxy's plane, and its fragment shader decides, for every pixel, which
// empire owns that spot. Every star an empire holds (its project systems,
// plus the stars network.ts's claimTerritory gives it) sends out "influence"
// that fades with distance (a Gaussian bump, weight * exp(-d^2 / REACH)); a
// spot belongs to the empire with the most influence there, if it's strong
// enough. Bumps of nearby stars add up and melt into one smooth region, the
// same idea as "metaballs" (blobs that merge). Because the held stars sit on
// the hyperlanes, the regions grow lobes along the lanes and meet their
// neighbors at shared borders.
// Learn more: https://en.wikipedia.org/wiki/Metaballs
//
// Drawing the edges crisply at any zoom: dividing "how far the influence is
// above the threshold" by how fast it changes per pixel gives the distance
// to the border *in pixels* (a first-order "distance estimate"). With it the
// border line is about 1.5 pixels wide and antialiased (its last pixel
// fades), and the glowing band inside stays about 9 pixels wide, whatever
// the zoom.
// How fast it changes per pixel: the "gradient" (the direction and steepness
// of the slope) of a Gaussian bump has a simple formula, so the shader adds
// up each empire's gradient along with its influence, on the plane. dFdx and
// dFdy (how much a value changes to the next pixel right or down) of the
// plane position then convert it to pixels: the chain rule. (Taking dFdx of
// the influence itself would be simpler, but the GPU computes it from 2x2
// pixel blocks, which goes wrong where two empires meet: the border there
// would come out dashed.)
import { Mesh, NormalBlending, PlaneGeometry, ShaderMaterial, Vector3, Vector4 } from "three";
import type { Category } from "../../data/projects";
import { CATEGORY_ORDER } from "../layout";
import type { MapSystem } from "../types";
import type { Claim, MapNode } from "./network";
import { MAX_SYSTEMS, srgb, type Layer, type SharedUniforms } from "./shared";

const EMPIRES = CATEGORY_ORDER.length;
/** The most held stars the shader handles (GLSL arrays need a fixed size).
 *  88 = up to 24 systems + up to 64 network stars, so no claim is ever cut;
 *  that is about 145 fragment uniform vectors, under WebGL2's minimum of 224. */
export const MAX_CLAIMS = 88;
/** Each held star's reach: influence = weight * exp(-distance^2 / REACH). */
export const REACH = 3;
/** A spot is claimed where an empire's influence is above THRESHOLD. */
export const THRESHOLD = 0.3;

/**
 * How far from the galaxy's center territory is drawn: the farthest held
 * star plus its reach (where weight * exp(-r^2 / REACH) drops to THRESHOLD,
 * so r = sqrt(REACH * ln(weight / THRESHOLD))). map.ts frames the overview
 * to it, so no region runs off the edge.
 */
export function territoryExtent(claims: Claim[], nodes: MapNode[]): number {
  let extent = 0;
  for (const claim of claims) {
    const node = nodes[claim.node]!;
    const reach = Math.sqrt(REACH * Math.log(Math.max(claim.weight / THRESHOLD, 1)));
    extent = Math.max(extent, Math.hypot(node.x, node.z) + reach);
  }
  return extent;
}

export function createTerritory(
  shared: SharedUniforms,
  systems: MapSystem[],
  claims: Claim[],
  nodes: MapNode[],
  radius: number,
): Layer {
  const held = claims.slice(0, MAX_CLAIMS); // strongest first, so a cut drops the faintest
  // Per held star: x, z, weight, and which project system holds it, packed
  // into one vec4 (one uniform slot each).
  const packed = Array.from({ length: MAX_CLAIMS }, (_, i) => {
    const claim = held[i];
    if (!claim) return new Vector4();
    const node = nodes[claim.node]!;
    return new Vector4(node.x, node.z, claim.weight, claim.system);
  });
  // Each project system's empire, as an index into CATEGORY_ORDER.
  const empireOf = Array.from({ length: MAX_SYSTEMS }, (_, i) =>
    systems[i] ? CATEGORY_ORDER.indexOf(systems[i].category) : 0,
  );
  const material = new ShaderMaterial({
    uniforms: {
      lit: shared.lit,
      pixelRatio: shared.pixelRatio,
      resolution: shared.resolution,
      claims: { value: packed },
      empireOf: { value: empireOf },
      count: { value: held.length },
      empires: { value: CATEGORY_ORDER.map(() => new Vector3()) },
      fill: { value: 0.1 },
      band: { value: 0.3 },
      edge: { value: 0.8 },
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
      #define MAX_CLAIMS ${MAX_CLAIMS}
      #define EMPIRES ${EMPIRES}
      uniform vec4 claims[MAX_CLAIMS];
      uniform float empireOf[MAX_SYSTEMS];
      uniform float lit[MAX_SYSTEMS];
      uniform int count;
      uniform vec3 empires[EMPIRES];
      uniform float pixelRatio;
      uniform vec2 resolution;
      uniform float fill;
      uniform float band;
      uniform float edge;
      varying vec2 vPos;

      const float REACH = ${REACH.toFixed(3)};
      const float THRESHOLD = ${THRESHOLD.toFixed(3)};

      void main() {
        float influence[EMPIRES];
        vec2 gradient[EMPIRES];
        float litSum[EMPIRES];
        for (int e = 0; e < EMPIRES; e++) { influence[e] = 0.0; gradient[e] = vec2(0.0); litSum[e] = 0.0; }
        for (int i = 0; i < MAX_CLAIMS; i++) {
          if (i >= count) break;
          vec4 claim = claims[i];
          vec2 d = vPos - claim.xy;
          float w = claim.z * exp(-dot(d, d) / REACH);
          int system = int(claim.w + 0.5);
          int e = int(empireOf[system] + 0.5);
          influence[e] += w;
          gradient[e] += w * (-2.0 / REACH) * d; // the slope of w * exp(-|d|^2 / REACH)
          litSum[e] += w * lit[system];
        }
        // The strongest empire here, and the runner-up.
        int owner = 0;
        int rival = 0;
        float best = 0.0;
        float second = 0.0;
        for (int e = 0; e < EMPIRES; e++) {
          if (influence[e] > best) { second = best; rival = owner; best = influence[e]; owner = e; }
          else if (influence[e] > second) { second = influence[e]; rival = e; }
        }
        if (best < THRESHOLD * 0.5) discard; // unclaimed space: draw nothing

        // From slopes on the plane to slopes per pixel (the chain rule).
        vec2 dx = dFdx(vPos);
        vec2 dy = dFdy(vPos);
        vec2 g = gradient[owner];
        float perPixel = length(vec2(dot(g, dx), dot(g, dy))) + 1e-6;
        // Signed distance to the region's edge, in device pixels (+ inside).
        float edgeDistance = (best - THRESHOLD) / perPixel;
        // Where two claimed empires meet, the front between them is where
        // their influences are equal: the same estimate on the difference.
        vec2 gLead = gradient[owner] - gradient[rival];
        float frontDistance = second > THRESHOLD
          ? (best - second) / (length(vec2(dot(gLead, dx), dot(gLead, dy))) + 1e-6)
          : 1e4;
        float nearest = min(edgeDistance, frontDistance); // to the closest edge or front

        float halfLine = 0.75 * pixelRatio; // a 1.5 CSS-pixel line
        float inside = clamp(edgeDistance + 0.5, 0.0, 1.0);
        float line = 1.0 - clamp(abs(nearest) - halfLine + 0.5, 0.0, 1.0);
        // The glowing band: strongest at the border, gone about 9 CSS
        // pixels in, like the inner edge of an empire on a strategy map.
        float glow = 1.0 - smoothstep(0.0, 9.0 * pixelRatio, nearest);
        float alpha = max(inside * (fill + band * glow * glow), line * edge);
        // Dimmed by the project filter: how lit the systems holding this spot
        // are, weighted by their influence here.
        alpha *= mix(0.16, 1.0, litSum[owner] / best);
        // Fade out over the last few pixels at the canvas's edges, so a region
        // that runs off the map (when zoomed in) melts away instead of being
        // cut by a hard line.
        vec2 fromEdge = min(gl_FragCoord.xy, resolution - gl_FragCoord.xy);
        alpha *= smoothstep(0.0, 18.0 * pixelRatio, min(fromEdge.x, fromEdge.y));
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
      const u = material.uniforms;
      const empires = u.empires!.value as Vector3[];
      CATEGORY_ORDER.forEach((category: Category, e) => empires[e]!.copy(srgb(palette.categories[category] ?? "#888")));
      // The fill is a whisper; the border and the band inside it carry the
      // shape. Fainter by day, so the sky still shows through.
      u.fill!.value = light ? 0.07 : 0.1;
      u.band!.value = light ? 0.2 : 0.3;
      u.edge!.value = light ? 0.75 : 0.85;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
