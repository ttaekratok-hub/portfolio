// The shared WebGL "engine" both scenes run on. It owns the parts every 3D
// scene needs and that are easy to get wrong:
//   - the renderer, with a capped pixel ratio (a 3x phone screen would paint
//     9x the pixels of a 1x one, for little visible gain)
//   - the frame loop: continuous while animating, a single frame on request
//     otherwise (paused, Reduce Motion, or something changed once)
//   - pausing while the canvas is off-screen (IntersectionObserver) or the
//     tab is hidden (requestAnimationFrame stops by itself there)
//   - resizing with the canvas (ResizeObserver)
//   - surviving a lost GPU context (the browser may drop it under memory
//     pressure; it can come back)
//   - cleanup, so nothing keeps running after the component goes away
// It imports Three.js, so it's only ever loaded through the scenes' dynamic
// import(), never by the main bundle.
// Learn more: https://threejs.org/manual/#en/responsive
import { WebGLRenderer } from "three";

export interface EngineHooks {
  /** The canvas changed size, in CSS pixels: update cameras and buffers. */
  onResize(width: number, height: number): void;
  /** Draw one frame. `delta` is the seconds since the previous frame (0 for a one-off frame). */
  onFrame(delta: number): void;
}

export interface Engine {
  renderer: WebGLRenderer;
  /** Keep drawing frames (true) or only when asked (false). */
  setAnimating(on: boolean): void;
  /** Draw one frame soon, e.g. after a settings change while paused. */
  requestRender(): void;
  dispose(): void;
}

/**
 * A rough "how much can this device take" guess, without measuring: small
 * screens and few CPU cores usually mean a phone or a low-power machine.
 * Scenes use it to pick star counts.
 */
export function lowPowerDevice(): boolean {
  const smallScreen = Math.min(window.screen.width, window.screen.height) < 700;
  const fewCores = (navigator.hardwareConcurrency || 4) <= 4;
  return smallScreen || fewCores;
}

export function createEngine(
  canvas: HTMLCanvasElement,
  hooks: EngineHooks,
  { maxPixelRatio = 2, alpha = false }: { maxPixelRatio?: number; alpha?: boolean } = {},
): Engine {
  // antialias off: these scenes are mostly soft points, where it barely shows
  // and costs a lot on phones.
  const renderer = new WebGLRenderer({ canvas, antialias: false, alpha, powerPreference: "default" });

  let animating = false;
  let onScreen = true;
  let frame = 0; // the pending requestAnimationFrame id, 0 if none
  let last = 0; // timestamp of the previous frame, 0 after a break

  function tick(now: number) {
    frame = 0;
    const delta = last ? Math.min(0.1, (now - last) / 1000) : 0; // clamp after a stall
    hooks.onFrame(delta);
    if (animating && onScreen) {
      last = now;
      frame = requestAnimationFrame(tick);
    } else {
      last = 0;
    }
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(tick);
  }

  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPixelRatio));
    renderer.setSize(width, height, false); // false: leave the CSS size alone
    hooks.onResize(width, height);
    schedule();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);

  const intersection = new IntersectionObserver(([entry]) => {
    onScreen = entry?.isIntersecting ?? true;
    if (onScreen && animating) schedule();
  });
  intersection.observe(canvas);

  // preventDefault() tells the browser we'd like the context back; when it
  // returns, Three.js re-uploads its resources and we redraw.
  const onLost = (event: Event) => {
    event.preventDefault();
    cancelAnimationFrame(frame);
    frame = 0;
  };
  const onRestored = () => schedule();
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  resize();

  return {
    renderer,
    setAnimating(on) {
      animating = on;
      if (on && onScreen) schedule();
    },
    requestRender: schedule,
    dispose() {
      cancelAnimationFrame(frame);
      frame = 0;
      resizeObserver.disconnect();
      intersection.disconnect();
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      // Frees GPU memory. (Not forceContextLoss(): React may reuse this same
      // canvas, e.g. in development's StrictMode double mount.)
      renderer.dispose();
    },
  };
}
