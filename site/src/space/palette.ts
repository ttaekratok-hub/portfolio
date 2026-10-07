// Reads the space colors from CSS (the --space-* tokens in
// styles/tokens.css), so the scenes and the page share one palette with light
// and dark values, and a color change happens in one place.
//
// getComputedStyle returns the value the browser resolved for the current
// appearance, so calling this again after the light/dark switch gives the
// other set.

export interface SpacePalette {
  background: string;
  skyTop: string;
  skyBottom: string;
  star: string;
  core: string;
  arm: string;
  nebula: [string, string, string];
  /** Category colors for the project map, like empires on a galaxy map. */
  categories: Record<string, string>;
}

function read(style: CSSStyleDeclaration, name: string, fallback: string): string {
  return style.getPropertyValue(name).trim() || fallback;
}

export function readPalette(element: Element = document.documentElement): SpacePalette {
  const s = getComputedStyle(element);
  return {
    background: read(s, "--space-bg", "#03040a"),
    skyTop: read(s, "--sky-top", "#03040a"),
    skyBottom: read(s, "--sky-bottom", "#03040a"),
    star: read(s, "--space-star", "#ffffff"),
    core: read(s, "--space-core", "#ffd8a8"),
    arm: read(s, "--space-arm", "#8fb4ff"),
    nebula: [
      read(s, "--space-nebula-1", "#7b4dff"),
      read(s, "--space-nebula-2", "#00b8c8"),
      read(s, "--space-nebula-3", "#ff3d8b"),
    ],
    categories: {
      infrastructure: read(s, "--empire-infrastructure", "#3d8bff"),
      networking: read(s, "--empire-networking", "#2fd3b0"),
      software: read(s, "--empire-software", "#b26bff"),
      embedded: read(s, "--empire-embedded", "#ffb23d"),
      techart: read(s, "--empire-techart", "#ff5c8a"),
    },
  };
}

/** Whether this browser can do WebGL 2 at all (without loading Three.js). */
export function webglAvailable(): boolean {
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}
