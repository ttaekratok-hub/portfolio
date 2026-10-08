// The interactive galaxy map of projects, above the project filter
// (Projects.tsx). Each project is a star system; each category an "empire"
// with its own color and territory, as on a strategy-game galaxy map.
//
// Two layers share the work:
//   - space/map.ts draws the picture with WebGL (loaded later with a dynamic
//     import(), so Three.js stays out of the main bundle) and reports where
//     each system is on screen whenever the camera moves.
//   - This component puts a real <button> on each system, with a small label,
//     and shows a detail panel for the selected one. Real buttons mean the
//     map works with a keyboard (Tab, then Enter or Space) and a screen
//     reader with no extra code, and the browser does the hit-testing.
// The project cards below stay the main way to read everything; the map is
// a second, more playful way in.
//
// The page structure, and why:
//   .galaxy-map           the whole thing (role="group"); buttons and panel
//                         are positioned against it
//     .galaxy-map-frame   the rounded window with the canvas (it clips the
//                         canvas only)
//     ul > li > button    one per system, floating over the frame
//            + section    the detail panel, right after its system's button
// The panel comes right after its button in the page's order, so Tab goes
// from a system into its panel and then on to the next system. On wide
// screens it floats over the right side of the map; on phones it sits below
// the map, in the normal flow of the page, so the whole map stays visible and
// nothing in the panel needs its own scrolling.
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import "../styles/map.css";
import type { Filter } from "../data/projects";
import { layoutSystems } from "../space/layout";
import type { MapScreenPosition } from "../space/map";
import { categoryNames, matchesFilter, placeLabels, PROJECT_BY_ID, shortLabel, type Placement } from "../space/map/labels";
import { webglAvailable } from "../space/palette";
import type { GalaxyMapScene } from "../space/types";
import { useSceneOptions, useSpaceScene } from "./SpaceBackground";

const SYSTEMS = layoutSystems();
/** Systems closer than this to the map's edge (CSS pixels) get no button: it would hang outside. */
const EDGE = 10;
/** Room between the selection ring and the selected system's label, in CSS pixels. */
const RING_GAP = 6;

export function GalaxyMap({ filter, onShowAll }: { filter: Filter; onShowAll?: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  // Per-frame bookkeeping for the labels, kept in refs: it changes up to 30
  // times a second and never needs a re-render.
  const labelSizes = useRef(new Map<string, { width: number; height: number }>());
  const placements = useRef(new Map<string, Placement>());
  const lastPositions = useRef<MapScreenPosition[]>([]);
  const measuredWidth = useRef(0);
  const selectedRef = useRef<string | null>(null);
  const pointerOver = useRef(false);
  const [selected, setSelected] = useState<string | null>(null);
  // No map possible: no WebGL, or it failed to start. Starts false, also in
  // the pre-rendered HTML, so hydration matches; the effect below finds out.
  const [unavailable, setUnavailable] = useState(false);
  const options = useSceneOptions();
  const headingId = useId();

  // Where the detail panel is, in the map's coordinates, and whether it
  // covers the map (wide screens) or sits below it (phones).
  const panelBox = () => {
    const panel = panelRef.current;
    const frame = frameRef.current;
    if (!panel || !frame) return null;
    return {
      left: panel.offsetLeft,
      top: panel.offsetTop,
      right: panel.offsetLeft + panel.offsetWidth,
      bottom: panel.offsetTop + panel.offsetHeight,
      overMap: panel.offsetTop < frame.offsetHeight,
    };
  };

  // Move each button to its system and pick its label's side. The scene calls
  // this every time the systems move on screen, so it sets styles directly
  // instead of going through React state (no re-render per frame). Setting
  // element.style from JavaScript is allowed by the Content-Security-Policy.
  // All reads (sizes) come before all writes (styles): alternating them would
  // make the browser recompute the layout on every read ("layout thrashing").
  const place = (positions: MapScreenPosition[], settled = false) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    lastPositions.current = positions;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width !== measuredWidth.current) {
      labelSizes.current.clear(); // the text may have wrapped or the font loaded
      measuredWidth.current = width;
    }
    // The camera has come to rest: lay the labels out afresh, rather than
    // keep the sides they took while the view was moving (zoomed in, say).
    if (settled) placements.current = new Map();
    // Keep systems out from under the detail panel (and so out of the Tab
    // order: a focused button must never hide behind it). The labels keep
    // clear of the panel too. A panel below the map (phones) covers nothing.
    const box = panelBox();
    const panelRect = box?.overMap
      ? { left: box.left - 16, top: box.top - 16, right: box.right + 16, bottom: box.bottom + 16 }
      : null;
    const covered = (x: number, y: number) =>
      !!panelRect && x > panelRect.left && x < panelRect.right && y > panelRect.top && y < panelRect.bottom;

    const shown: Array<MapScreenPosition & { width: number; height: number; gapX: number; gapY: number }> = [];
    for (const p of positions) {
      const button = buttonRefs.current.get(p.id);
      const inside = p.x >= EDGE && p.x <= width - EDGE && p.y >= EDGE && p.y <= height - EDGE;
      if (!button || !p.visible || !inside || covered(p.x, p.y)) continue;
      let size = labelSizes.current.get(p.id);
      const label = button.firstElementChild as HTMLElement | null;
      // Measured while showing its text (a collapsed label isn't displayed).
      if (!size && label?.offsetWidth) {
        size = { width: label.offsetWidth, height: label.offsetHeight };
        labelSizes.current.set(p.id, size);
      }
      // Not measurable yet (hidden until now): a guess from the text length.
      shown.push({
        ...p,
        ...(size ?? { width: 16 + 7.5 * (label?.textContent?.length ?? 12), height: 24 }),
        // The selected system's label goes outside its selection ring.
        gapX: p.ringX ? Math.round(p.ringX + RING_GAP) : 0,
        gapY: p.ringY ? Math.round(p.ringY + RING_GAP) : 0,
      });
    }
    // Most important first: the selected system, then the nearest ones.
    shown.sort((a, b) => Number(b.id === selectedRef.current) - Number(a.id === selectedRef.current) || a.depth - b.depth);
    placements.current = placeLabels(shown, { width, height }, placements.current, panelRect ? [panelRect] : []);

    for (const p of shown) {
      const button = buttonRefs.current.get(p.id)!;
      const placement = placements.current.get(p.id)!;
      button.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
      // Nearer systems' labels on top of farther ones. A custom property, not
      // z-index itself, so map.css can still raise a hovered or focused one.
      button.style.setProperty("--z", String(10 + Math.round((1 - p.depth) * 20)));
      // A wider gap for the selected system (map.css adds it to the padding).
      for (const [name, gap] of [["--gap-x", p.gapX], ["--gap-y", p.gapY]] as const) {
        if (gap) button.style.setProperty(name, `${gap}px`);
        else button.style.removeProperty(name);
      }
      if (button.dataset.side !== placement.side) button.dataset.side = placement.side;
      if (placement.collapsed !== ("collapsed" in button.dataset)) {
        if (placement.collapsed) button.dataset.collapsed = "";
        else delete button.dataset.collapsed;
      }
      button.dataset.placed = "";
    }
    // Not placed (off-screen or under the panel): hidden, and so out of the
    // Tab order and the accessibility tree.
    for (const [id, button] of buttonRefs.current) {
      const hide = !placements.current.has(id);
      if (button.hidden !== hide) button.hidden = hide;
    }
  };

  // Where the selected system should appear: the middle of the part of the
  // map the detail panel leaves free. The panel is a column on the right on
  // wide screens, and below the map on phones (map.css), leaving all of it.
  const focusPoint = () => {
    const box = panelBox();
    const width = canvasRef.current?.clientWidth;
    if (!box?.overMap || !width) return { x: 0.5, y: 0.5 };
    return { x: box.left / 2 / width, y: 0.5 };
  };

  const { ready, scene } = useSpaceScene(
    canvasRef,
    (canvas, initial) =>
      import("../space/map")
        .then((m) =>
          m.createGalaxyMap(canvas, SYSTEMS, { onScreenPositions: place, focusPoint }, initial, containerRef.current ?? undefined),
        )
        .catch((error: unknown) => {
          // WebGL is there but failed (blocked, out of memory...): say so
          // instead of leaving an empty box.
          setUnavailable(true);
          throw error;
        }),
    options,
  );
  const map = scene as RefObject<GalaxyMapScene | null>;

  // Without WebGL, useSpaceScene never starts the scene; show a note instead.
  // Checked once after hydration. The state is set from a microtask, not in
  // the effect itself: an effect that sets state right away makes React
  // render twice for nothing (the react-hooks lint rule set-state-in-effect).
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active && !webglAvailable()) setUnavailable(true);
    });
    return () => {
      active = false;
    };
  }, []);

  // Tell the scene about the filter and the selection after rendering (refs
  // are for effects and event handlers, not for reading during render). The
  // focus effect also runs once the scene is ready, which gives the new
  // buttons their first positions.
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);
  useEffect(() => {
    map.current?.highlight(filter);
    // Dimmed labels use a lighter weight, so they're measured again and laid
    // out afresh at once (the camera may be still, with no new positions coming).
    labelSizes.current.clear();
    if (lastPositions.current.length) place(lastPositions.current);
    // place() only reads refs; it's left out of the dependencies on purpose,
    // as a new copy of it is made on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, ready, map]);
  useEffect(() => {
    if (ready) map.current?.focus(selected);
  }, [ready, map, selected]);

  // On phones the panel opens below the map, possibly below the screen's
  // edge: scroll just enough to show it ("nearest"), smoothly unless the
  // visitor asked for less motion. (jsdom lacks scrollIntoView, hence ?.)
  useEffect(() => {
    if (!selected || panelBox()?.overMap !== false) return;
    panelRef.current?.scrollIntoView?.({ block: "nearest", behavior: options.reduceMotion ? "auto" : "smooth" });
    // Only when the selection changes, not when the motion setting does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // Track the pointer over the map, for the Escape key below.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const enter = () => (pointerOver.current = true);
    const leave = () => (pointerOver.current = false);
    container.addEventListener("pointerenter", enter);
    container.addEventListener("pointerleave", leave);
    return () => {
      container.removeEventListener("pointerenter", enter);
      container.removeEventListener("pointerleave", leave);
    };
  }, []);

  // Escape closes the panel when it's about the map: focus is in the map,
  // the pointer is over it, or focus is nowhere in particular (on the page
  // itself, where Safari leaves it after a click) while the map is on
  // screen. Escape meant for something else (another component, a dialog)
  // is left alone. If focus was inside the panel, it goes back to the
  // system's button rather than being lost with the panel.
  useEffect(() => {
    if (!selected) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const container = containerRef.current;
      if (!container) return;
      const active = document.activeElement;
      const rect = container.getBoundingClientRect();
      const onScreen = rect.bottom > 0 && rect.top < window.innerHeight;
      const aboutMap =
        container.contains(active) || pointerOver.current || ((!active || active === document.body) && onScreen);
      if (!aboutMap) return;
      const wasInPanel = panelRef.current?.contains(active);
      setSelected(null);
      if (wasInPanel) buttonRefs.current.get(selected)?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selected]);

  const project = selected ? PROJECT_BY_ID.get(selected) : undefined;
  // Read out politely (when the screen reader is idle) on each selection.
  const announcement = project
    ? `${project.title}, ${project.year}${project.status ? `, ${project.status}` : ""}. ${project.summary}`
    : "";

  // The container, frame and canvas are always rendered, also in the
  // pre-rendered HTML, so the canvas exists when useSpaceScene's effect runs
  // after hydration. The system buttons appear only once the scene is
  // drawing: before that (or without WebGL) they'd have nowhere to go.
  return (
    <div
      ref={containerRef}
      className={unavailable ? "galaxy-map is-unavailable" : ready ? "galaxy-map is-ready" : "galaxy-map"}
      role="group"
      aria-label="Galaxy map of projects"
    >
      <div ref={frameRef} className="galaxy-map-frame">
        <canvas ref={canvasRef} className="galaxy-map-canvas" aria-hidden="true" />
        {unavailable && (
          <p className="galaxy-map-note">The interactive map needs WebGL; every project is listed below.</p>
        )}
      </div>
      <p className="visually-hidden">Every project on this map is also listed below the filter.</p>
      {ready && (
        <ul className="galaxy-map-systems">
          {SYSTEMS.map((system) => {
            const info = PROJECT_BY_ID.get(system.id)!;
            const isSelected = selected === system.id;
            return (
              // data-category sets the --empire color for the selected
              // label's ring and the panel (map.css).
              <li key={system.id} data-category={system.category}>
                <button
                  ref={(el) => {
                    if (el) buttonRefs.current.set(system.id, el);
                    else buttonRefs.current.delete(system.id);
                  }}
                  type="button"
                  className={matchesFilter(system.id, filter) ? "galaxy-system" : "galaxy-system is-dimmed"}
                  // The full title and categories; the visible label is a
                  // shorter piece of the title (see space/map/labels.ts).
                  aria-label={`${info.title}, ${categoryNames(info.categories)}`}
                  aria-pressed={isSelected}
                  onClick={() => setSelected(isSelected ? null : system.id)}
                >
                  <span className="galaxy-system-label">{shortLabel(system.id, system.title)}</span>
                </button>
                {/* Right after its button in the page's order, so the next
                    Tab goes into the panel, then on to the next system. */}
                {isSelected && (
                  <section ref={panelRef} className="galaxy-panel" aria-labelledby={headingId}>
                    <div className="galaxy-panel-top">
                      <p className="galaxy-panel-empire">{categoryNames(info.categories)}</p>
                      <button
                        type="button"
                        className="galaxy-panel-close"
                        aria-label="Close details"
                        onClick={() => {
                          setSelected(null);
                          buttonRefs.current.get(system.id)?.focus();
                        }}
                      >
                        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                    <h3 className="galaxy-panel-title" id={headingId}>
                      {info.title}
                    </h3>
                    <p className="card-meta">
                      {info.status && <span className="status">{info.status}</span>}
                      {info.year}
                    </p>
                    <p className="galaxy-panel-summary">{info.summary}</p>
                    <ul className="tags" aria-label="Built with">
                      {info.tech.map((tech) => (
                        <li key={tech}>{tech}</li>
                      ))}
                    </ul>
                    <a
                      className="galaxy-panel-link"
                      href={`#${system.id}`}
                      onClick={() => {
                        // The card may be hidden by the filter. flushSync makes
                        // React show all cards *now*, before the browser
                        // follows the link, so the target exists to scroll to.
                        if (!matchesFilter(system.id, filter)) flushSync(() => onShowAll?.());
                      }}
                    >
                      View project card <span className="visually-hidden">for {info.title}</span>
                    </a>
                  </section>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
