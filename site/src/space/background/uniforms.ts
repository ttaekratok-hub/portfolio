// Uniforms several of the background's shaders read. A uniform is a value
// the JavaScript side hands to a shader, the same for every vertex and pixel
// of one draw (a "uniform" value, unlike per-star attributes). In Three.js
// each one is a small object, { value }. Materials that list the same object
// share it: background.ts changes uTime.value once per frame and every
// shader using it sees the new time, with no copying.
import { Vector2, Vector4 } from "three";

export function createSharedUniforms() {
  return {
    /** The canvas's size in CSS pixels, right now. */
    uViewport: { value: new Vector2(1, 1) },
    /**
     * The size things are laid out on, in CSS pixels: the same as uViewport,
     * except that on touch screens the height ignores the browser's toolbar
     * sliding in and out (it keeps the tallest height seen at this width), so
     * stars and clouds don't jump each time it does (background.ts).
     */
    uLayout: { value: new Vector2(1, 1) },
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
    /** 1 when the visitor asked for more contrast (prefers-contrast: more). */
    uMoreContrast: { value: 0 },
    // The legibility zones (glsl.ts, ZONES_GLSL), as left, top, right, bottom.
    uTextRect: { value: new Vector4(0, 0, 0, 0) },
    uHeroRect: { value: new Vector4(0, 0, 0, 0) },
    /** How wide the soft edge around the text block is, in CSS pixels. */
    uTextRamp: { value: 110 },
    uZones: { value: 0 },
  };
}

export type SharedUniforms = ReturnType<typeof createSharedUniforms>;
