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

export function GalaxyMap({ filter, onShowAll }: { filter: Filter; onShowAll?: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  // Per-frame bookkeeping for the labels, kept in refs: it changes up to 60
  // times a second and never needs a re-render.
  const labelSizes = useRef(new Map<string, { width: number; height: number }>());
  const placements = useRef(new Map<string, Placement>());
  const measuredWidth = useRef(0);
  const selectedRef = useRef<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // No map possible: no WebGL, or it failed to start. Starts false, also in
  // the pre-rendered HTML, so hydration matches; the effect below finds out.
  const [unavailable, setUnavailable] = useState(false);
  const options = useSceneOptions();
  const headingId = useId();

  // Move each button to its system and pick its label's side. The scene calls
  // this every time the camera moves, so it sets styles directly instead of
  // going through React state (no re-render per frame). Setting element.style
  // from JavaScript is allowed by the Content-Security-Policy.
  // All reads (sizes) come before all writes (styles): alternating them would
  // make the browser recompute the layout on every read ("layout thrashing").
  const place = (positions: MapScreenPosition[]) => {
    const container = containerRef.current;
    if (!container) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width !== measuredWidth.current) {
      labelSizes.current.clear(); // the text may have wrapped or the font loaded
      measuredWidth.current = width;
    }
    // Keep systems out from under the detail panel (and so out of the Tab
    // order: a focused button must never hide behind it).
    // The labels keep clear of the panel too.
    const panel = panelRef.current;
    const panelRect = panel && {
      left: panel.offsetLeft - 16,
      top: panel.offsetTop - 16,
      right: panel.offsetLeft + panel.offsetWidth + 16,
      bottom: panel.offsetTop + panel.offsetHeight + 16,
    };
    const covered = (x: number, y: number) =>
      !!panelRect && x > panelRect.left && x < panelRect.right && y > panelRect.top && y < panelRect.bottom;

    const shown: Array<MapScreenPosition & { width: number; height: number }> = [];
    for (const p of positions) {
      const button = buttonRefs.current.get(p.id);
      if (!button || !p.visible || p.x < 6 || p.x > width - 6 || p.y < 6 || p.y > height - 6 || covered(p.x, p.y)) continue;
      let size = labelSizes.current.get(p.id);
      const label = button.firstElementChild as HTMLElement | null;
      // Measured while showing its text (a collapsed label is just a dot).
      if (!size && label?.offsetWidth && !("collapsed" in button.dataset)) {
        size = { width: label.offsetWidth, height: label.offsetHeight };
        labelSizes.current.set(p.id, size);
      }
      // Not measurable yet (hidden until now): a guess from the text length.
      shown.push({ ...p, ...(size ?? { width: 16 + 7.5 * (label?.textContent?.length ?? 12), height: 24 }) });
    }
    // Most important first: the selected system, then the nearest ones.
    shown.sort((a, b) => Number(b.id === selectedRef.current) - Number(a.id === selectedRef.current) || a.depth - b.depth);
    placements.current = placeLabels(shown, { width, height }, placements.current, panelRect ? [panelRect] : []);

    for (const p of positions) {
      const button = buttonRefs.current.get(p.id);
      if (!button) continue;
      const placement = placements.current.get(p.id);
      button.hidden = !placement; // not placed: off-screen or under the panel
      if (!placement) continue;
      button.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
      // Nearer systems' labels on top of farther ones. A custom property, not
      // z-index itself, so map.css can still raise a hovered or focused one.
      button.style.setProperty("--z", String(10 + Math.round((1 - p.depth) * 20)));
      if (button.dataset.side !== placement.side) button.dataset.side = placement.side;
      if (placement.collapsed !== ("collapsed" in button.dataset)) {
        if (placement.collapsed) button.dataset.collapsed = "";
        else delete button.dataset.collapsed;
      }
      button.dataset.placed = "";
    }
  };

  // Where the selected system should appear: the middle of the part of the
  // map the detail panel leaves free. The panel is a column on the right on
  // wide screens and a bottom sheet on phones (map.css).
  const focusPoint = () => {
    const container = containerRef.current;
    const panel = panelRef.current;
    if (!container || !panel) return { x: 0.5, y: 0.5 };
    if (panel.offsetWidth < container.clientWidth * 0.7) {
      return { x: panel.offsetLeft / 2 / container.clientWidth, y: 0.5 };
    }
    return { x: 0.5, y: panel.offsetTop / 2 / container.clientHeight };
  };

  const { ready, scene } = useSpaceScene(
    canvasRef,
    (canvas, initial) =>
      import("../space/map")
        .then((m) => m.createGalaxyMap(canvas, SYSTEMS, { onScreenPositions: place, focusPoint }, initial))
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
  }, [filter, ready, map]);
  useEffect(() => {
    if (ready) map.current?.focus(selected);
  }, [ready, map, selected]);

  // Escape closes the panel, wherever focus is (after a click, Safari leaves
  // focus on the page, not the button). If focus was inside the panel, it
  // goes back to the system's button rather than being lost with the panel.
  useEffect(() => {
    if (!selected) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const wasInPanel = panelRef.current?.contains(document.activeElement);
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

  // The container and canvas are always rendered, also in the pre-rendered
  // HTML, so the canvas exists when useSpaceScene's effect runs after
  // hydration. The system buttons appear only once the scene is drawing:
  // before that (or without WebGL) they'd have nowhere to go.
  return (
    <div
      ref={containerRef}
      className={unavailable ? "galaxy-map is-unavailable" : ready ? "galaxy-map is-ready" : "galaxy-map"}
      role="group"
      aria-label="Galaxy map of projects"
    >
      <canvas ref={canvasRef} className="galaxy-map-canvas" aria-hidden="true" />
      <p className="visually-hidden">Every project on this map is also listed below the filter.</p>
      {ready && (
        <ul className="galaxy-map-systems">
          {SYSTEMS.map((system) => {
            const info = PROJECT_BY_ID.get(system.id)!;
            const isSelected = selected === system.id;
            return (
              // data-category sets the --empire color for the label's dot
              // and the panel (map.css).
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
                  <span className="galaxy-system-label">
                    <span className="galaxy-system-text">{shortLabel(system.id, system.title)}</span>
                  </span>
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
      {unavailable && (
        <p className="galaxy-map-note">The interactive map needs WebGL; every project is listed below.</p>
      )}
    </div>
  );
}
