// The contract between the React components and the WebGL scenes. The
// components (SpaceBackground.tsx, GalaxyMap.tsx) are in the main bundle; the
// scenes (background.ts, map.ts) import Three.js and are loaded later with a
// dynamic import(), so the page appears before ~150 kB of 3D code arrives.
// Types are erased at build time, so importing this file costs nothing.
import type { Category, Filter } from "../data/projects";

/** What every scene needs to know about the visitor's settings. */
export interface SceneOptions {
  /** The visitor asked for less motion: draw still frames, no camera drift. */
  reduceMotion: boolean;
  /** The pause button: stop the animation, keep the current frame. */
  paused: boolean;
}

export interface SpaceScene {
  /** Apply new settings; cheap to call often. */
  update(options: SceneOptions): void;
  /** Free the GPU and remove listeners. The scene can't be used afterwards. */
  dispose(): void;
}

/** One project, placed as a star system on the project map. */
export interface MapSystem {
  id: string;
  title: string;
  category: Category;
  /** Scene coordinates on the map's galaxy disc (x-z plane, y up). */
  position: [number, number, number];
}

/** Where a system currently appears on screen, in CSS pixels inside the map. */
export interface ScreenPosition {
  id: string;
  x: number;
  y: number;
  /** False when behind the camera or outside the canvas. */
  visible: boolean;
}

export interface MapCallbacks {
  /** Called whenever the systems move on screen (camera motion, resize). */
  onScreenPositions(positions: ScreenPosition[]): void;
}

export interface GalaxyMapScene extends SpaceScene {
  /** Fly the camera to a system (or back to the overview with null). */
  focus(id: string | null): void;
  /** Dim systems that don't match the project filter. */
  highlight(filter: Filter): void;
}
