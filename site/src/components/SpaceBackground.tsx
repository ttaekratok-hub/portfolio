// The space behind the whole page: one fixed, full-screen <canvas> drawn by
// space/background.ts (starfield, galaxy, nebula). Content scrolls over it.
//
// Loading order, so the page appears fast:
//   1. The pre-rendered HTML has an empty canvas; CSS paints a gradient
//      behind it (body::before in global.css), so the page already looks
//      like space before any JavaScript.
//   2. After hydration, when the browser is idle (requestIdleCallback), the
//      scene module is fetched with a dynamic import(). Vite puts it, with
//      Three.js, in a separate file, so the main bundle stays small.
//   3. The scene draws its first frame and the canvas fades in over the
//      gradient (.is-ready).
// No WebGL (very old browser, or disabled): step 2 is skipped and the gradient
// stays. Nothing breaks.
import { useEffect, useRef, useState } from "react";
import { useMediaQuery } from "../hooks";
import { setPaused, usePaused } from "../space/motion";
import { webglAvailable } from "../space/palette";
import type { SceneOptions, SpaceScene } from "../space/types";

/** The visitor's settings that every scene follows, as plain values. */
export function useSceneOptions(): SceneOptions {
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const paused = usePaused();
  return { reduceMotion, paused };
}

/**
 * Starts a scene on a canvas once the browser is idle, keeps it in sync with
 * the visitor's settings, and disposes it on unmount. `load` returns the
 * scene factory from a dynamic import(). Returns whether the scene is running.
 */
export function useSpaceScene(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  load: (canvas: HTMLCanvasElement, options: SceneOptions) => Promise<SpaceScene>,
  options: SceneOptions,
): { ready: boolean; scene: React.RefObject<SpaceScene | null> } {
  const sceneRef = useRef<SpaceScene | null>(null);
  // The latest options, readable from the async loader without restarting it.
  const optionsRef = useRef(options);
  const loadRef = useRef(load);
  const [ready, setReady] = useState(false);
  const { reduceMotion, paused } = options;

  useEffect(() => {
    optionsRef.current = { reduceMotion, paused };
    sceneRef.current?.update(optionsRef.current);
  }, [reduceMotion, paused]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !webglAvailable()) return;
    let cancelled = false;
    let scene: SpaceScene | null = null;
    const start = () => {
      loadRef
        .current(canvas, optionsRef.current)
        .then((created) => {
          if (cancelled) return created.dispose();
          scene = created;
          sceneRef.current = created;
          setReady(true);
        })
        .catch(() => {}); // no scene: the CSS fallback stays, which is fine
    };
    // requestIdleCallback runs `start` when the browser has nothing urgent to
    // do (Safari lacks it, hence the timer fallback).
    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(start, { timeout: 1500 })
      : window.setTimeout(start, 300);
    return () => {
      cancelled = true;
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
      scene?.dispose();
      sceneRef.current = null;
    };
  }, [canvasRef]);

  return { ready, scene: sceneRef };
}

export function SpaceBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const options = useSceneOptions();
  const { ready } = useSpaceScene(
    canvasRef,
    (canvas, initial) => import("../space/background").then((m) => m.createBackground(canvas, initial)),
    options,
  );

  return (
    <>
      {/* Pure decoration: aria-hidden keeps it out of the accessibility tree. */}
      <canvas ref={canvasRef} className={ready ? "space-canvas is-ready" : "space-canvas"} aria-hidden="true" />
      {/* Moving content that plays for more than five seconds needs a way to
          stop it (WCAG 2.2.2). The button floats above the page, so it gets the
          Liquid Glass material, like the nav. It's only shown when something
          is actually animating: not before the scene loads, and not with
          Reduce Motion, where the scenes draw still frames. */}
      {ready && !options.reduceMotion && (
        <button
          type="button"
          className="motion-toggle glass"
          aria-label={options.paused ? "Play background animation" : "Pause background animation"}
          onClick={() => setPaused(!options.paused)}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            {options.paused ? (
              <path d="M4 2.5v11l9-5.5z" fill="currentColor" />
            ) : (
              <path d="M4 2.5h3v11H4zm5 0h3v11H9z" fill="currentColor" />
            )}
          </svg>
        </button>
      )}
    </>
  );
}
