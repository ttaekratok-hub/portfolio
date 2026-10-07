// SHELL, to be finished: the interactive galaxy map of projects (Projects.tsx
// renders it above the filter). The 3D part is space/map.ts, loaded later
// with a dynamic import(). Each project is a star system; real <button>s sit
// on top of the 3D stars, so the map works with a keyboard and screen reader.
// The project cards below remain the main way to read the content.
import { useEffect, useRef, useState } from "react";
import "../styles/map.css";
import type { Filter } from "../data/projects";
import { layoutSystems } from "../space/layout";
import type { GalaxyMapScene, ScreenPosition } from "../space/types";
import { useSceneOptions, useSpaceScene } from "./SpaceBackground";

const SYSTEMS = layoutSystems();

export function GalaxyMap({ filter }: { filter: Filter }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const [selected, setSelected] = useState<string | null>(null);
  const options = useSceneOptions();

  // Move each button to its system's position on screen. Called by the scene
  // every time the camera moves, so it sets styles directly instead of going
  // through React state (no re-render per frame). Setting element.style from
  // JavaScript is allowed by the Content-Security-Policy.
  const place = (positions: ScreenPosition[]) => {
    for (const p of positions) {
      const button = buttonRefs.current.get(p.id);
      if (!button) continue;
      button.style.transform = `translate(${p.x}px, ${p.y}px)`;
      button.hidden = !p.visible;
    }
  };
  const { ready, scene } = useSpaceScene(
    canvasRef,
    (canvas, initial) =>
      import("../space/map").then((m) => m.createGalaxyMap(canvas, SYSTEMS, { onScreenPositions: place }, initial)),
    options,
  );
  // Tell the scene about the filter after rendering (refs are for effects and
  // event handlers, not for reading during render).
  useEffect(() => {
    (scene.current as GalaxyMapScene | null)?.highlight(filter);
  }, [filter, ready, scene]);
  // The buttons only exist once the scene runs (below), so ask it for fresh
  // positions as soon as they're there.
  useEffect(() => {
    if (ready) (scene.current as GalaxyMapScene | null)?.focus(null);
  }, [ready, scene]);

  // The container and canvas are always rendered, also in the pre-rendered
  // HTML, so the canvas exists when useSpaceScene's effect runs after
  // hydration. The system buttons appear only once the scene is drawing:
  // before that (or without WebGL) they'd have nowhere to go.
  return (
    <div className={ready ? "galaxy-map is-ready" : "galaxy-map"} role="group" aria-label="Galaxy map of projects">
      <canvas ref={canvasRef} className="galaxy-map-canvas" aria-hidden="true" />
      <p className="visually-hidden">Every project on this map is also listed below the filter.</p>
      <div className="galaxy-map-systems">
        {ready && SYSTEMS.map((system) => (
          <button
            key={system.id}
            ref={(el) => {
              if (el) buttonRefs.current.set(system.id, el);
              else buttonRefs.current.delete(system.id);
            }}
            type="button"
            className="galaxy-system"
            aria-pressed={selected === system.id}
            onClick={() => {
              const next = selected === system.id ? null : system.id;
              setSelected(next);
              (scene.current as GalaxyMapScene | null)?.focus(next);
            }}
          >
            {system.title}
          </button>
        ))}
      </div>
    </div>
  );
}
