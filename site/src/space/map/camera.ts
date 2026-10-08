// The project map's camera: where it looks from, how the overview is framed,
// and how it glides between views. No Three.js objects are created here; it
// only moves the PerspectiveCamera map.ts owns.
//
// The camera orbits a point on the galaxy's plane (the "target"), like a
// drone circling it: `azimuth` is the compass direction it looks from,
// `elevation` how high above the plane (90 degrees = straight down), and
// `distance` how far away. These are spherical coordinates; the camera's
// x, y, z position follows from them with sin and cos.
// Learn more: https://en.wikipedia.org/wiki/Spherical_coordinate_system
import { MathUtils, Vector3, type PerspectiveCamera } from "three";

/**
 * How high the camera looks from: 56 degrees above the plane, a strategy
 * map's three-quarter view, on wide maps. A tilted disc looks wider than
 * tall, so a portrait map (phones) looks from higher up, 64 degrees, where
 * the disc is rounder and fills more of the frame.
 */
export function elevationFor(width: number, height: number): number {
  return MathUtils.degToRad(width < height ? 64 : 56);
}

/** One camera framing. Transitions blend from one View to another. */
export interface View {
  /** The point looked at, on the plane (x, z). */
  x: number;
  z: number;
  distance: number;
  /** Radians above the plane (see elevationFor). */
  elevation: number;
  /**
   * Where on the canvas the target appears, as fractions of its width and
   * height (0.5, 0.5 = the center). Off-center when the detail panel covers
   * part of the map, so the selected system sits in the part still visible.
   */
  focusX: number;
  focusY: number;
}

/** Place the camera for a view, seen from `azimuth` radians around the target. */
export function applyView(camera: PerspectiveCamera, view: View, azimuth: number, width: number, height: number): void {
  const flat = Math.cos(view.elevation) * view.distance; // horizontal part of the distance
  camera.position.set(
    view.x + Math.sin(azimuth) * flat,
    Math.sin(view.elevation) * view.distance,
    view.z + Math.cos(azimuth) * flat,
  );
  camera.lookAt(view.x, 0, view.z);
  // A "lens shift": setViewOffset renders a window of a larger, virtual
  // image, which moves everything on screen without turning the camera (no
  // change in perspective), like the shift lens of an architecture camera.
  // The target, at the center of the virtual image, lands at
  // (focusX, focusY) of the canvas.
  camera.setViewOffset(width, height, (0.5 - view.focusX) * width, (0.5 - view.focusY) * height, width, height);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

/**
 * The overview: the distance at which a disc of `radius` around the center
 * fills `fill` of the canvas (0.9 = 90%), and the focusY that centers it vertically
 * (the near half of a tilted disc looks bigger than the far half, so the
 * disc's middle isn't the picture's middle).
 *
 * Found by search rather than a formula: try a distance, project points on
 * the disc's rim to the screen, and halve the search interval toward the
 * distance where the rim just fits ("binary search"). 24 halvings pin it
 * down far below a pixel.
 */
export function fitOverview(camera: PerspectiveCamera, radius: number, width: number, height: number, fill = 0.9): View {
  const rim = Array.from({ length: 48 }, (_, i) => {
    const a = (i / 48) * Math.PI * 2;
    return new Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius);
  });
  const point = new Vector3();
  const elevation = elevationFor(width, height);
  const extent = (distance: number) => {
    applyView(camera, { x: 0, z: 0, distance, elevation, focusX: 0.5, focusY: 0.5 }, 0, width, height);
    let minY = Infinity;
    let maxY = -Infinity;
    let maxX = 0;
    for (const p of rim) {
      // project(): from scene coordinates to "normalized device coordinates",
      // -1 to 1 across the canvas in x and y.
      point.copy(p).project(camera);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
      maxX = Math.max(maxX, Math.abs(point.x));
    }
    return { size: Math.max(maxX, (maxY - minY) / 2), middle: (maxY + minY) / 2 };
  };
  let near = radius * 0.5;
  let far = radius * 20;
  for (let i = 0; i < 24; i++) {
    const mid = (near + far) / 2;
    if (extent(mid).size > fill) near = mid;
    else far = mid;
  }
  // Normalized y points up and runs -1 to 1; canvas fractions point down
  // and run 0 to 1, hence the halving and the sign.
  const { middle } = extent(far);
  return { x: 0, z: 0, distance: far, elevation, focusX: 0.5, focusY: 0.5 + middle / 2 };
}

/** Blend two views: t = 0 gives `a`, 1 gives `b`. */
export function mixViews(a: View, b: View, t: number): View {
  const mix = (p: number, q: number) => p + (q - p) * t;
  return {
    x: mix(a.x, b.x),
    z: mix(a.z, b.z),
    // Distances blend in log space: zooming from 10 to 40 passes 20 halfway
    // (each step feels the same size), not 25.
    distance: Math.exp(mix(Math.log(a.distance), Math.log(b.distance))),
    elevation: mix(a.elevation, b.elevation),
    focusX: mix(a.focusX, b.focusX),
    focusY: mix(a.focusY, b.focusY),
  };
}

/**
 * Easing: how a transition's progress (0 to 1 over time) maps to how far it
 * has moved. Linear motion starts and stops abruptly; this "ease in-out
 * cubic" curve starts slowly, speeds up, and settles gently, like a camera
 * operator would move.
 * Learn more: https://easings.net/#easeInOutCubic
 */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}
