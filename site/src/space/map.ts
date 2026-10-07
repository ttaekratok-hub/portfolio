// The interactive galaxy map of projects (Stellaris-style), drawn with
// Three.js. components/GalaxyMap.tsx loads it with a dynamic import() and
// puts real HTML buttons over the systems; this file draws the picture and
// moves the camera.
//
// What's on it, back to front (each one draw call; see the files in map/):
//   sky        background color, deep space or a daytime blue  (backdrop.ts)
//   haze       the galaxy's glowing core and arms             (backdrop.ts)
//   dust       thousands of faint stars, a small spiral galaxy (backdrop.ts)
//   territory  each category's region, like an empire's       (territory.ts)
//   lanes      hyperlanes between stars, routes highlighted    (lanes.ts, network.ts)
//   ring       the selection ring around the chosen system     (stars.ts)
//   stars      project systems (bright) and unclaimed stars    (stars.ts)
//
// How it moves:
//   - Auto-rotation: the camera slowly circles the galaxy while animations
//     run. It eases to a stop while the pointer is over the map or a system
//     has keyboard focus, so targets hold still while you aim.
//   - focus(id): the camera glides to the system (an eased transition over
//     about a second; instant with Reduce Motion) and zooms in a little.
//     focus(null) glides back to the overview.
//   - highlight(filter): systems and territories outside the filter fade.
//   - Drag (mouse only) turns the map. The mouse wheel and touch are left
//     alone, so the page scrolls normally over the map.
//
// Where the buttons go: Three.js can *project* a point of the scene to the
// screen (Vector3.project), which is the opposite of "raycasting" (shooting
// a ray from a screen point into the scene to see what it hits). Projecting
// the systems every time the camera moves and putting HTML buttons there
// makes hit-testing the browser's job, and keyboard and screen-reader
// support come with real buttons for free.
import { PerspectiveCamera, Scene, Vector3 } from "three";
import type { Filter } from "../data/projects";
import { createEngine, lowPowerDevice } from "./engine";
import { createDust, createHaze, createSky } from "./map/backdrop";
import { applyView, easeInOutCubic, fitOverview, mixViews, type View } from "./map/camera";
import { matchesFilter } from "./map/labels";
import { createLanes } from "./map/lanes";
import { buildNetwork } from "./map/network";
import { createSharedUniforms, MAX_SYSTEMS, type Layer } from "./map/shared";
import { createSelectionRing, createStars } from "./map/stars";
import { createTerritory } from "./map/territory";
import { readPalette, type SpacePalette } from "./palette";
import type { GalaxyMapScene, MapCallbacks, MapSystem, SceneOptions, ScreenPosition } from "./types";

export interface MapScreenPosition extends ScreenPosition {
  /** 0 for the system nearest the camera, 1 for the farthest. */
  depth: number;
}

export interface GalaxyMapCallbacks extends MapCallbacks {
  onScreenPositions(positions: MapScreenPosition[]): void;
  /**
   * Where a selected system should appear, as fractions of the canvas
   * (0.5, 0.5 is the middle): the middle of whatever the detail panel leaves
   * uncovered. Asked whenever a system is focused or the map resizes.
   */
  focusPoint?(): { x: number; y: number };
}

/** The disc the systems sit on (layoutSystems' radius). */
const RADIUS = 10;
/** One full turn every 5 minutes, in radians per second: barely moving. */
const SPIN_SPEED = (Math.PI * 2) / 300;
/** Seconds for the camera to glide to a system or back. */
const GLIDE = 1.1;
/** Seconds for systems and territories to fade with the filter. */
const FADE = 0.35;
/**
 * How close the camera gets to a selected system, relative to the overview.
 * Closer on portrait maps (phones), where the detail panel leaves only a
 * strip of the map: fewer neighbors crowd into it.
 */
const zoomFor = (width: number, height: number) => (width < height ? 0.45 : 0.6);

export function createGalaxyMap(
  canvas: HTMLCanvasElement,
  systems: MapSystem[],
  callbacks: GalaxyMapCallbacks,
  initial: SceneOptions,
): GalaxyMapScene {
  if (systems.length > MAX_SYSTEMS) throw new Error(`The map shows at most ${MAX_SYSTEMS} systems`);
  const lowPower = lowPowerDevice();
  const scene = new Scene();
  // A narrow field of view (38 degrees, vertically) flattens perspective a
  // little, like a long lens: the far side of the map doesn't shrink much.
  const camera = new PerspectiveCamera(38, 1, 0.1, 400);
  const shared = createSharedUniforms();
  const container = canvas.parentElement ?? canvas;

  let options = initial;
  let size = { width: 1, height: 1 };
  let overview: View = { x: 0, z: 0, distance: 30, elevation: 1, focusX: 0.5, focusY: 0.5 };
  let view = overview; // what the camera shows now
  let glide: { from: View; progress: number } | null = null; // a camera transition under way
  let azimuth = 0.35; // radians around the galaxy; this start frames the map nicely
  let spin = SPIN_SPEED; // current rotation speed, eased toward 0 or SPIN_SPEED
  let selected = -1; // index into systems, -1 for none
  let hovering = false;
  let keyboardFocus = false;
  let drag: { x: number } | null = null;
  let positionsDirty = true; // the systems moved on screen: tell the buttons
  let started = false;
  const lit = shared.lit.value; // per system, the current fade (1 lit, 0 dimmed)
  const litGoal = systems.map(() => 1);
  let ring = { appear: 0, goal: 0 };
  let palette: SpacePalette = readPalette();

  // The view the camera should end up in: the overview, or zoomed in on the
  // selected system, placed where the detail panel leaves room.
  function goalView(): View {
    const system = systems[selected];
    if (!system) return overview;
    const point = callbacks.focusPoint?.() ?? { x: 0.5, y: 0.5 };
    return {
      ...overview,
      x: system.position[0],
      z: system.position[2],
      distance: overview.distance * zoomFor(size.width, size.height),
      focusX: point.x,
      focusY: point.y,
    };
  }

  const engine = createEngine(
    canvas,
    {
      onResize(width, height) {
        size = { width, height };
        camera.aspect = width / height;
        // The renderer has just sized the canvas's pixel buffer, so this is
        // the real number of device pixels per CSS pixel.
        shared.pixelRatio.value = canvas.width / width;
        shared.resolution.value.set(canvas.width, canvas.height);
        // Frame the systems (out to 85% of the radius) and their labels; the
        // galaxy's faint rim may run off the edges.
        overview = fitOverview(camera, RADIUS * 0.94, width, height);
        shared.referenceDepth.value = overview.distance;
        // Re-aim at once: a resize shouldn't animate.
        if (!glide) view = goalView();
        positionsDirty = true;
      },
      onFrame(delta) {
        if (!started) return;
        step(delta);
        applyView(camera, view, azimuth, size.width, size.height);
        engine.renderer.render(scene, camera);
        if (positionsDirty) {
          positionsDirty = false;
          report();
        }
        // Nothing left to animate: stop the loop until something changes.
        // (Only ever switched *off* from inside a frame; see engine.ts.)
        if (!needsFrames()) engine.setAnimating(false);
      },
    },
    { maxPixelRatio: lowPower ? 1.5 : 2 },
  );

  // ---------- Layers ----------
  const network = buildNetwork(systems, { stars: lowPower ? 40 : 64, radius: RADIUS });
  const galaxyShape = { radius: RADIUS * 1.1, arms: 4, spin: 3.2 };
  const selectionRing = createSelectionRing(shared);
  const layers: Layer[] = [
    createSky(),
    createHaze(shared, galaxyShape),
    // Point counts: about a quarter of the hero galaxy's, fewer again on
    // phones and low-power machines. The map is small; more would only blur.
    createDust(shared, { ...galaxyShape, count: lowPower ? 7000 : 16000, seed: 2026 }),
    createTerritory(shared, systems, RADIUS),
    createLanes(shared, network),
    selectionRing,
    createStars(shared, network, systems, engine.renderer),
  ];
  for (const layer of layers) scene.add(layer.object);
  started = true;

  // ---------- Animation ----------

  /** Autonomous motion: rotation, twinkling, pulses. Off when paused or with Reduce Motion. */
  const autonomous = () => !options.paused && !options.reduceMotion;
  const fading = () => lit.some((v, i) => i < systems.length && v !== litGoal[i]) || ring.appear !== ring.goal;
  const needsFrames = () => autonomous() || !!glide || fading();

  // Moves `value` toward `goal` by at most `amount`: a steady fade.
  const approach = (value: number, goal: number, amount: number) =>
    value < goal ? Math.min(goal, value + amount) : Math.max(goal, value - amount);

  function step(delta: number) {
    if (autonomous()) {
      shared.time.value += delta;
      // Exponential smoothing: close a fixed share of the gap to the wanted
      // speed each second, whatever the frame rate. The rotation eases out
      // and back in instead of stopping dead.
      const wanted = hovering || keyboardFocus || drag ? 0 : SPIN_SPEED;
      spin += (wanted - spin) * (1 - Math.exp(-delta * 3));
      if (Math.abs(spin) > 1e-4) {
        azimuth += spin * delta;
        positionsDirty = true;
      }
    }
    if (glide) {
      glide.progress = Math.min(1, glide.progress + delta / GLIDE);
      view = mixViews(glide.from, goalView(), easeInOutCubic(glide.progress));
      if (glide.progress >= 1) glide = null;
      positionsDirty = true;
    }
    for (let i = 0; i < systems.length; i++) lit[i] = approach(lit[i]!, litGoal[i]!, delta / FADE);
    ring.appear = approach(ring.appear, ring.goal, delta / FADE);
    selectionRing.setAppear(easeInOutCubic(ring.appear));
  }

  /** Jump every transition to its end (Reduce Motion). */
  function finishTransitions() {
    glide = null;
    view = goalView();
    for (let i = 0; i < systems.length; i++) lit[i] = litGoal[i]!;
    ring.appear = ring.goal;
    selectionRing.setAppear(ring.appear);
    positionsDirty = true;
  }

  /** Start or stop the frame loop to match what's going on, and draw a frame. */
  function sync() {
    if (options.reduceMotion) finishTransitions();
    engine.setAnimating(needsFrames());
    engine.requestRender();
  }

  // ---------- Where the systems are on screen ----------
  const point = new Vector3();
  function report() {
    const depths = systems.map((s) => point.set(...s.position).applyMatrix4(camera.matrixWorldInverse).z * -1);
    const near = Math.min(...depths);
    const far = Math.max(...depths);
    callbacks.onScreenPositions(
      systems.map((s, i) => {
        point.set(...s.position).project(camera);
        const x = ((point.x + 1) / 2) * size.width;
        const y = ((1 - point.y) / 2) * size.height;
        return {
          id: s.id,
          x,
          y,
          visible: point.z < 1 && x >= 0 && x <= size.width && y >= 0 && y <= size.height,
          depth: far > near ? (depths[i]! - near) / (far - near) : 0,
        };
      }),
    );
  }

  // ---------- Colors ----------
  function applyPalette() {
    palette = readPalette();
    const light = options.scheme === "light";
    shared.light.value = light ? 1 : 0;
    for (const layer of layers) layer.setPalette(palette, light);
    const system = systems[selected];
    if (system) selectionRing.show(system.position, palette.categories[system.category] ?? palette.star);
  }

  // ---------- Pointer and focus ----------
  // Listeners go on the map's container (the canvas's parent), which also
  // holds the system buttons, so hovering a label counts as hovering the map.
  const onPointerEnter = (event: PointerEvent) => {
    if (event.pointerType !== "touch") hovering = true;
  };
  const onPointerLeave = () => {
    hovering = false;
    sync();
  };
  const onFocusIn = (event: FocusEvent) => {
    // Only keyboard focus: a mouse click focuses a button too, and the
    // rotation shouldn't stay stopped after the pointer has left.
    keyboardFocus = event.target instanceof Element && event.target.matches(":focus-visible");
  };
  const onFocusOut = (event: FocusEvent) => {
    if (!(event.relatedTarget instanceof Node && container.contains(event.relatedTarget))) keyboardFocus = false;
  };
  // Drag to turn, for a mouse only. Pointer capture keeps the moves coming
  // to the canvas even when the pointer leaves it mid-drag.
  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType !== "mouse" || event.button !== 0 || options.reduceMotion) return;
    drag = { x: event.clientX };
    canvas.setPointerCapture(event.pointerId);
    canvas.dataset.drag = "active";
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!drag) return;
    azimuth -= (event.clientX - drag.x) * 0.005; // radians per pixel: a full turn per ~1250px
    drag.x = event.clientX;
    positionsDirty = true;
    engine.requestRender();
  };
  const onPointerUp = (event: PointerEvent) => {
    if (!drag) return;
    drag = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    canvas.dataset.drag = "on";
  };
  container.addEventListener("pointerenter", onPointerEnter);
  container.addEventListener("pointerleave", onPointerLeave);
  container.addEventListener("focusin", onFocusIn);
  container.addEventListener("focusout", onFocusOut);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);

  function apply() {
    // data-drag="on" gives the canvas a grab cursor (map.css), where dragging works.
    if (options.reduceMotion) delete canvas.dataset.drag;
    else if (canvas.dataset.drag !== "active") canvas.dataset.drag = "on";
    sync();
  }
  applyPalette();
  apply();

  return {
    update(next) {
      const schemeChanged = next.scheme !== options.scheme;
      options = next;
      if (schemeChanged) applyPalette();
      apply();
    },
    focus(id) {
      selected = systems.findIndex((s) => s.id === id);
      const system = systems[selected];
      if (system) {
        selectionRing.show(system.position, palette.categories[system.category] ?? palette.star);
        ring = { appear: 0, goal: 1 }; // replay the ring's appearance on each new system
      } else {
        ring.goal = 0;
      }
      // Glide only if there's somewhere to go (GalaxyMap also calls
      // focus(null) at the start, just to get fresh positions).
      const goal = goalView();
      const keys = ["x", "z", "distance", "elevation", "focusX", "focusY"] as const;
      const moving = keys.some((k) => Math.abs(goal[k] - view[k]) > 1e-3);
      glide = moving ? { from: view, progress: 0 } : null;
      positionsDirty = true;
      sync();
    },
    highlight(filter: Filter) {
      systems.forEach((s, i) => (litGoal[i] = matchesFilter(s.id, filter) ? 1 : 0));
      sync();
    },
    dispose() {
      container.removeEventListener("pointerenter", onPointerEnter);
      container.removeEventListener("pointerleave", onPointerLeave);
      container.removeEventListener("focusin", onFocusIn);
      container.removeEventListener("focusout", onFocusOut);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      delete canvas.dataset.drag;
      for (const layer of layers) layer.dispose();
      engine.dispose();
    },
  };
}
