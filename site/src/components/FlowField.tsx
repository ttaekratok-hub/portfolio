// The animated hero background, drawn with the Canvas 2D API. React renders
// only an empty <canvas> (that's all the pre-rendered HTML contains); all the
// drawing happens in the browser, inside one useEffect. Hero.tsx places it, and
// its colors come from the --flow-* variables in styles/tokens.css.
//
// The idea: a "flow field" gives every point on the screen a direction. Each
// frame, every particle takes a small step in the direction under it and draws
// that step as a short line, so the particles trace smooth, curving paths.
//
// Motion that runs for more than five seconds needs a way to stop it (WCAG
// 2.2.2, "Pause, Stop, Hide"), so there's a pause button in the hero's corner.
// With Reduce Motion on, the hero is a still image and the button isn't shown.
//
// Try it: Chrome DevTools > Rendering > "Emulate CSS media feature
// prefers-reduced-motion: reduce": the hero becomes a still image right away,
// no reload needed (useMediaQuery follows the setting live).
import { useEffect, useRef, useState } from "react";
import { useIsBrowser, useMediaQuery } from "../hooks";

// An interface describes an object's shape. Like all types, it's checked at
// compile time and erased from the JavaScript the browser gets.
interface Particle {
  x: number;
  y: number;
  life: number; // frames left before the particle respawns somewhere random
}

// Cheap smooth pseudo-noise: a sum of sines. Good enough for a flow field
// and easy to read; swap in simplex noise if you want more organic motion.
// Returns an angle in radians for point (x, y) at time t. `s` sets the size of
// the swirls: smaller values change more slowly across the screen.
function field(x: number, y: number, t: number): number {
  const s = 0.0025;
  return (Math.sin(x * s + t) * Math.cos(y * s * 1.3 - t * 0.7) + Math.sin((x + y) * s * 0.6 + t * 0.5)) * Math.PI;
}

/**
 * The animated hero background: particles drifting through a noise field.
 * Colors come from CSS variables, so it follows light/dark mode. It pauses
 * while off-screen and draws a single still frame for Reduce Motion.
 */
export function FlowField() {
  // Two inputs that decide whether the animation runs. Both are React values,
  // so the button below re-renders when they change.
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [paused, setPaused] = useState(false);
  // The button only works once JavaScript runs, so it's left out of the
  // pre-rendered HTML (no dead control before hydration or without JS).
  const isBrowser = useIsBrowser();

  // The drawing code lives in a long-running effect (below) that must not be
  // torn down and set up again when these change: that would throw away the
  // particles and the picture on screen. So it reads them through refs, which
  // it can see at any time without re-running, and this small effect copies
  // the latest values in and asks the loop to react (startRef holds its start()).
  const pausedRef = useRef(false);
  const reduceMotionRef = useRef(false);
  const startRef = useRef(() => {});
  useEffect(() => {
    pausedRef.current = paused;
    reduceMotionRef.current = reduceMotion;
    startRef.current();
  }, [paused, reduceMotion]);

  // A ref is a box that React keeps between renders. Passing it as
  // ref={canvasRef} (below) makes React put the real <canvas> DOM element in
  // canvasRef.current once it's on the page, so the effect can draw on it.
  // Learn more: https://react.dev/reference/react/useRef
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Everything browser-only lives in this effect, which runs after the canvas
  // is on the page and never during pre-rendering. [] means "set up once". The
  // function returned at the end is the cleanup: React calls it when the
  // component goes away (and in development, StrictMode calls it between two
  // setups to check that it really undoes everything).
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return; // no canvas support (e.g. the test DOM, see tests/setup.ts)

    // matchMedia evaluates a CSS media query from JavaScript; here it reports
    // when the system switches between light and dark.
    const darkScheme = window.matchMedia?.("(prefers-color-scheme: dark)");

    // Plain variables, not React state: they change every frame and nothing
    // React renders depends on them. useState would re-render the component on
    // every frame for no benefit.
    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    let frame = 0;
    let onScreen = true;
    let colors = readColors();

    // About the `!` after canvas and ctx below: TypeScript doesn't carry the
    // null check above into function declarations, because they're hoisted
    // (callable from anywhere in this scope, even before the check). `!` says
    // "not null here", which is true because they're only called after it.

    // The colors live in CSS (styles/tokens.css, with light and dark values),
    // so they're read from the canvas's computed style instead of repeated here.
    function readColors() {
      const style = getComputedStyle(canvas!);
      return {
        bg: style.getPropertyValue("--flow-bg").trim() || "#000",
        fade: style.getPropertyValue("--flow-fade").trim() || "rgb(0 0 0 / 0.06)",
        lightness: style.getPropertyValue("--flow-lightness").trim() || "64%",
      };
    }

    // A canvas has two sizes: its size on the page in CSS pixels (clientWidth
    // and clientHeight) and its bitmap, the pixels actually drawn (width and
    // height). On a high-density screen (devicePixelRatio 2 or 3, like Retina) a
    // bitmap the CSS size would look blurry, so the bitmap is dpr times larger and
    // setTransform scales every drawing call by dpr, letting the rest of the code
    // work in CSS pixels. Capped at 2 to limit the pixels painted each frame
    // (3x would be 2.25 times as many).
    // Learn more: https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio
    // Returns true if it really resized (which clears the canvas).
    function resize(): boolean {
      const newWidth = canvas!.clientWidth;
      const newHeight = canvas!.clientHeight;
      // On phones, `resize` also fires when the URL bar slides in or out during
      // scrolling: same width, slightly different height. Ignoring height-only
      // changes that small keeps the animation from restarting mid-scroll.
      if (newWidth === width && Math.abs(newHeight - height) < 120) return false; // mobile URL bar
      width = newWidth;
      height = newHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      // One particle per 4,000 square CSS pixels, so a phone and a desktop look
      // equally dense.
      particles = Array.from({ length: Math.floor((width * height) / 4000) }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        life: Math.random() * 200,
      }));
      ctx!.fillStyle = colors.bg;
      ctx!.fillRect(0, 0, width, height);
      return true;
    }

    // One frame. Instead of clearing the canvas, it paints a nearly transparent
    // layer (--flow-fade) over everything, so older strokes fade out gradually
    // and leave trails. `time` is in milliseconds; t is a slowed-down version of
    // it, so the field itself drifts slowly too.
    function draw(time: number) {
      const t = time * 0.0001;
      ctx!.fillStyle = colors.fade;
      ctx!.fillRect(0, 0, width, height);
      for (const p of particles) {
        const angle = field(p.x, p.y, t);
        const nx = p.x + Math.cos(angle) * 1.2;
        const ny = p.y + Math.sin(angle) * 1.2;
        // Apple-like blue → indigo → purple hues.
        const hue = 215 + 60 * Math.sin(angle);
        ctx!.strokeStyle = `hsl(${hue} 85% ${colors.lightness} / 0.5)`;
        ctx!.beginPath();
        ctx!.moveTo(p.x, p.y);
        ctx!.lineTo(nx, ny);
        ctx!.stroke();
        p.x = nx;
        p.y = ny;
        p.life -= 1;
        // Out of life or off the canvas: start again at a random point.
        if (p.life < 0 || p.x < 0 || p.x > width || p.y < 0 || p.y > height) {
          p.x = Math.random() * width;
          p.y = Math.random() * height;
          p.life = 100 + Math.random() * 200;
        }
      }
    }

    // The animation loop. requestAnimationFrame asks the browser to call loop()
    // just before its next repaint, usually once per display refresh, and most
    // browsers pause it in background tabs. Each frame schedules the next one
    // until onScreen turns false. `frame` keeps the request's id so that
    // cancelAnimationFrame can call it off.
    // Learn more: https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
    function loop(time: number) {
      draw(time);
      if (running()) frame = requestAnimationFrame(loop);
    }

    // Should frames keep coming? Only while visible, not paused, and without
    // Reduce Motion. The refs always hold the latest values.
    function running(): boolean {
      return onScreen && !pausedRef.current && !reduceMotionRef.current;
    }

    // 360 steps drawn at once: one still image with trails, no animation.
    function drawStill() {
      for (let i = 0; i < 360; i++) draw(i * 16);
    }

    // Brings the canvas in line with the current settings. Safe to call again:
    // it cancels any pending frame first, so two loops never run at once.
    // Paused, it simply stops scheduling frames, so the last one stays on screen.
    function start() {
      cancelAnimationFrame(frame);
      if (reduceMotionRef.current) drawStill();
      else if (running()) frame = requestAnimationFrame(loop);
    }
    startRef.current = start;

    // After the canvas was cleared (resize, color change), a running animation
    // repaints itself; otherwise draw a still image so the hero isn't blank.
    // Off-screen with the animation on, there's nothing to do: the observer
    // restarts it on the way back. The still image is 360 frames of work, so
    // it waits until resizing has paused for 150ms ("debouncing") instead of
    // being redrawn for every step of a window drag.
    let stillTimer = 0;
    function repaint() {
      if (running()) return start();
      if (!onScreen && !pausedRef.current && !reduceMotionRef.current) return;
      window.clearTimeout(stillTimer);
      stillTimer = window.setTimeout(drawStill, 150);
    }

    // IntersectionObserver calls back when the canvas scrolls into or out of
    // view. Off-screen, loop() stops scheduling frames, which saves CPU and
    // battery; back on screen, start() resumes it. `([entry])` takes the first
    // item of the array the callback receives; with tsconfig's
    // noUncheckedIndexedAccess it may be undefined, hence `?.`, and `?? true`
    // (nullish coalescing: use the right side if the left is null or undefined).
    // Learn more: https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(([entry]) => {
            onScreen = entry?.isIntersecting ?? true;
            if (running()) start();
          });
    observer?.observe(canvas);

    // The system switched between light and dark: re-read the colors and repaint.
    const onSchemeChange = () => {
      colors = readColors();
      width = 0; // force a full repaint in the new colors
      resize();
      repaint();
    };
    // A real resize clears the canvas; repaint so a paused or Reduce Motion
    // hero doesn't go blank (a running one redraws itself anyway).
    const onResize = () => {
      if (resize()) repaint();
    };
    darkScheme?.addEventListener("change", onSchemeChange);
    window.addEventListener("resize", onResize);

    resize();
    start();

    // Cleanup: undo everything the setup started. Without it, mounting again
    // (or StrictMode's development double run) would leave an extra animation
    // loop and extra listeners running.
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      darkScheme?.removeEventListener("change", onSchemeChange);
      window.removeEventListener("resize", onResize);
      window.clearTimeout(stillTimer);
      startRef.current = () => {};
    };
  }, []);

  // A fragment (<>...</>) returns two elements without an extra wrapper <div>.
  // The canvas is pure decoration, so aria-hidden hides it from screen readers;
  // the button is a real control. Its accessible name says what it will do and
  // changes with the state. It's not rendered with Reduce Motion (no motion to
  // stop), nor in the pre-rendered HTML (isBrowser is false there).
  return (
    <>
      <canvas ref={canvasRef} className="flow-field" aria-hidden="true" />
      {isBrowser && !reduceMotion && (
        <button
          type="button"
          className="motion-toggle"
          aria-label={paused ? "Play background animation" : "Pause background animation"}
          onClick={() => setPaused((p) => !p)}
        >
          {/* Pass a function to setPaused when the new value depends on the old
              one: React hands it the current value. */}
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            {paused ? (
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
