// PLACEHOLDER, to be replaced: the interactive project map scene. Loaded by
// components/GalaxyMap.tsx with a dynamic import(). For now it clears the
// canvas and reports where each system is on screen.
import { Color, PerspectiveCamera, Scene, Vector3 } from "three";
import { createEngine } from "./engine";
import { readPalette } from "./palette";
import type { GalaxyMapScene, MapCallbacks, MapSystem, SceneOptions } from "./types";

export function createGalaxyMap(
  canvas: HTMLCanvasElement,
  systems: MapSystem[],
  callbacks: MapCallbacks,
  initial: SceneOptions,
): GalaxyMapScene {
  const scene = new Scene();
  const camera = new PerspectiveCamera(45, 1, 0.1, 200);
  camera.position.set(0, 14, 14);
  camera.lookAt(0, 0, 0);
  let options = initial;
  let size = { width: 1, height: 1 };
  const engine = createEngine(canvas, {
    onResize(width, height) {
      size = { width, height };
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    onFrame() {
      engine.renderer.render(scene, camera);
      const v = new Vector3();
      callbacks.onScreenPositions(
        systems.map((s) => {
          v.set(...s.position).project(camera);
          return {
            id: s.id,
            x: ((v.x + 1) / 2) * size.width,
            y: ((1 - v.y) / 2) * size.height,
            visible: v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1,
          };
        }),
      );
    },
  });
  function apply() {
    scene.background = new Color(readPalette().background);
    engine.setAnimating(!options.paused && !options.reduceMotion);
    engine.requestRender();
  }
  apply();
  return {
    update(next) {
      options = next;
      apply();
    },
    focus: () => engine.requestRender(),
    highlight: () => engine.requestRender(),
    dispose: () => engine.dispose(),
  };
}
