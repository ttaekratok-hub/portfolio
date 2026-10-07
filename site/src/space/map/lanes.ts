// Hyperlanes: the thin routes between stars (network.ts decides which).
//
// WebGL can draw lines, but only 1 device pixel wide (the lineWidth setting
// is ignored almost everywhere), which on a phone's 3x screen is a hair. So
// each lane is a thin rectangle of two triangles, widened in *screen space*
// by the vertex shader: it projects both ends to the screen, finds the
// direction between them, and pushes each corner sideways by half the wanted
// width in pixels. The lane stays the same crisp width at any zoom or angle.
// Three.js's "fat lines" (Line2) work the same way.
// The fragment shader then fades the last pixel at each edge, which smooths
// the jagged edges without the cost of antialiasing the whole canvas.
import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, NormalBlending, ShaderMaterial, Vector3 } from "three";
import { CATEGORY_ORDER } from "../layout";
import type { MapNetwork } from "./network";
import { MAX_SYSTEMS, srgb, type Layer, type SharedUniforms } from "./shared";

export function createLanes(shared: SharedUniforms, network: MapNetwork): Layer {
  const { nodes, lanes } = network;
  const corners = lanes.length * 4;
  const start = new Float32Array(corners * 3);
  const end = new Float32Array(corners * 3);
  const corner = new Float32Array(corners * 2);
  const kind = new Float32Array(corners); // 0 neutral, 1 empire route, 2 border route
  const empire = new Float32Array(corners);
  const ends = new Float32Array(corners * 2);
  const length = new Float32Array(corners);
  const index: number[] = [];
  lanes.forEach((lane, l) => {
    const a = nodes[lane.a]!;
    const b = nodes[lane.b]!;
    // The four corners: (along 0 or 1, side -1 or +1).
    [
      [0, -1],
      [0, 1],
      [1, -1],
      [1, 1],
    ].forEach(([along, side], k) => {
      const v = l * 4 + k;
      start.set([a.x, 0, a.z], v * 3);
      end.set([b.x, 0, b.z], v * 3);
      corner.set([along!, side!], v * 2);
      kind[v] = lane.kind === "neutral" ? 0 : lane.kind === "empire" ? 1 : 2;
      empire[v] = lane.empire ? CATEGORY_ORDER.indexOf(lane.empire) : 0;
      ends.set(lane.ends ?? [-1, -1], v * 2);
      length[v] = Math.hypot(b.x - a.x, b.z - a.z);
    });
    // Two triangles per rectangle, sharing corners 1 and 2.
    const v = l * 4;
    index.push(v, v + 1, v + 2, v + 2, v + 1, v + 3);
  });
  const geometry = new BufferGeometry();
  // Three.js needs a "position" attribute to know how many vertices there
  // are; the shader works from `start` and `end` instead.
  geometry.setAttribute("position", new BufferAttribute(start, 3));
  geometry.setAttribute("end", new BufferAttribute(end, 3));
  geometry.setAttribute("corner", new BufferAttribute(corner, 2));
  geometry.setAttribute("kind", new BufferAttribute(kind, 1));
  geometry.setAttribute("empire", new BufferAttribute(empire, 1));
  geometry.setAttribute("ends", new BufferAttribute(ends, 2));
  geometry.setAttribute("laneLength", new BufferAttribute(length, 1));
  geometry.setIndex(index);

  const material = new ShaderMaterial({
    uniforms: {
      time: shared.time,
      pixelRatio: shared.pixelRatio,
      resolution: shared.resolution,
      lit: shared.lit,
      empires: { value: CATEGORY_ORDER.map(() => new Vector3()) },
      neutral: { value: new Vector3() },
      border: { value: new Vector3() },
      neutralAlpha: { value: 0.3 },
      routeAlpha: { value: 0.8 },
    },
    vertexShader: /* glsl */ `
      #define MAX_SYSTEMS ${MAX_SYSTEMS}
      attribute vec3 end;
      attribute vec2 corner;
      attribute float kind;
      attribute float empire;
      attribute vec2 ends;
      attribute float laneLength;
      uniform float pixelRatio;
      uniform vec2 resolution;
      uniform float lit[MAX_SYSTEMS];
      varying float vOffset;
      varying float vHalf;
      varying float vAlong;
      varying float vLength;
      varying float vKind;
      varying float vEmpire;
      varying float vLit;
      void main() {
        // Both ends in clip space, then in pixels from the screen's center.
        vec4 a = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vec4 b = projectionMatrix * modelViewMatrix * vec4(end, 1.0);
        vec2 halfScreen = resolution * 0.5;
        vec2 direction = normalize(b.xy / b.w * halfScreen - a.xy / a.w * halfScreen);
        vec2 normal = vec2(-direction.y, direction.x); // 90 degrees to the lane
        float width = (kind > 0.5 ? 1.6 : 1.0) * pixelRatio; // in device pixels
        float halfWidth = width * 0.5 + 1.0; // +1 pixel to fade out smoothly
        vec4 p = corner.x < 0.5 ? a : b;
        // Clip space is divided by w later, so the pixel offset is scaled by w.
        p.xy += normal * corner.y * halfWidth / halfScreen * p.w;
        gl_Position = p;
        vOffset = corner.y * halfWidth;
        vHalf = width * 0.5;
        vAlong = corner.x * laneLength;
        vLength = laneLength;
        vKind = kind;
        vEmpire = empire;
        // A route dims if either project it joins is dimmed by the filter.
        vLit = ends.x < 0.0 ? 1.0 : min(lit[int(ends.x)], lit[int(ends.y)]);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform vec3 empires[${CATEGORY_ORDER.length}];
      uniform vec3 neutral;
      uniform vec3 border;
      uniform float neutralAlpha;
      uniform float routeAlpha;
      varying float vOffset;
      varying float vHalf;
      varying float vAlong;
      varying float vLength;
      varying float vKind;
      varying float vEmpire;
      varying float vLit;
      void main() {
        // Coverage: 1 inside the lane, falling to 0 over the last pixel.
        float coverage = clamp(vHalf + 0.5 - abs(vOffset), 0.0, 1.0);
        vec3 color = neutral;
        float alpha = neutralAlpha;
        if (vKind > 0.5) {
          color = vKind < 1.5 ? empires[int(vEmpire + 0.5)] : border;
          // A soft pulse of light travels along each route, like traffic.
          // fract() repeats it every 2.5 units; time moves it forward. While
          // paused, time stops and the pulses hold still.
          float pulse = smoothstep(0.8, 1.0, fract(vAlong * 0.4 - time * 0.3));
          alpha = routeAlpha * (0.75 + 0.25 * pulse) * mix(0.2, 1.0, vLit);
        }
        // Fade in from each end, so lanes don't spike into the stars' cores.
        float fade = smoothstep(0.05, 0.35, vAlong) * smoothstep(0.05, 0.35, vLength - vAlong);
        gl_FragColor = vec4(color, alpha * coverage * fade);
      }
    `,
    transparent: true,
    blending: NormalBlending,
    depthTest: false,
    depthWrite: false,
    // GPUs skip triangles seen from the back ("back-face culling"), judged by
    // whether the corners go around clockwise or counterclockwise on screen.
    // A lane's corners go either way depending on which way it points, so
    // both sides must be drawn.
    side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false; // the shader moves vertices, so the bounds would be off
  mesh.renderOrder = 4;
  return {
    object: mesh,
    setPalette(palette, light) {
      const u = material.uniforms;
      (u.empires!.value as Vector3[]).forEach((v, e) => v.copy(srgb(palette.categories[CATEGORY_ORDER[e]!] ?? "#888")));
      // Ordinary lanes in the galaxy's arm color (darkened by day), border
      // routes between empires in white by night, deep blue-gray by day.
      u.neutral!.value.copy(srgb(palette.arm).multiplyScalar(light ? 0.5 : 1));
      u.border!.value.copy(light ? srgb(palette.arm).multiplyScalar(0.36) : srgb(palette.star));
      u.neutralAlpha!.value = light ? 0.3 : 0.26;
      u.routeAlpha!.value = light ? 0.85 : 0.75;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
