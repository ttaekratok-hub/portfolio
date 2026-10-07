// Uniforms several of the background's shaders read. A uniform is a value
// the JavaScript side hands to a shader, the same for every vertex and pixel
// of one draw (a "uniform" value, unlike per-star attributes). In Three.js
// each one is a small object, { value }. Materials that list the same object
// share it: background.ts changes uTime.value once per frame and every
// shader using it sees the new time, with no copying.
import { Vector2, Vector4 } from "three";

export function createSharedUniforms() {
  return {
    /** The window's size in CSS pixels. */
    uViewport: { value: new Vector2(1, 1) },
    /** The low-resolution picture's size, in its own pixels (background.ts). */
    uSoftSize: { value: new Vector2(1, 1) },
    /** Device pixels per CSS pixel (2 on most phones), capped by the engine. */
    uPixelRatio: { value: 1 },
    /** Seconds of animation. Stops while paused; fixed with Reduce Motion. */
    uTime: { value: 0 },
    /** The page's scroll position, eased, in CSS pixels. */
    uScroll: { value: 0 },
    /** The mouse, -1..1 across the window, eased (0 without a mouse). */
    uMouse: { value: new Vector2() },
    /** 0 in dark mode (space), 1 in light mode (daytime sky). */
    uDay: { value: 0 },
    // The legibility zones (glsl.ts, ZONES_GLSL), as left, top, right, bottom.
    uTextRect: { value: new Vector4(0, 0, 0, 0) },
    uHeroRect: { value: new Vector4(0, 0, 0, 0) },
    uZones: { value: 0 },
  };
}

export type SharedUniforms = ReturnType<typeof createSharedUniforms>;
