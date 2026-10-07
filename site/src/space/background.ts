// PLACEHOLDER, to be replaced: the page background scene (starfield, hero
// galaxy, nebula, daytime sky). Loaded by components/SpaceBackground.tsx with
// a dynamic import(). For now it only clears the canvas to the theme color.
import { Color, PerspectiveCamera, Scene } from "three";
import { createEngine } from "./engine";
import { readPalette } from "./palette";
import type { SceneOptions, SpaceScene } from "./types";

export function createBackground(canvas: HTMLCanvasElement, initial: SceneOptions): SpaceScene {
  const scene = new Scene();
  const camera = new PerspectiveCamera(60, 1, 0.1, 100);
  let options = initial;
  const engine = createEngine(canvas, {
    onResize(width, height) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    onFrame() {
      engine.renderer.render(scene, camera);
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
    dispose: () => engine.dispose(),
  };
}
