// Pieces every layer of the project map shares: the "uniforms" all its
// shaders read, a color helper, and the shape of a layer.
//
// A uniform is a value handed from JavaScript to a shader, the same for every
// vertex and pixel of one draw call ("uniform" across them), e.g. the time or
// the screen size. In Three.js each one is an object { value }. Here several
// materials hold the very same objects, so changing `uniforms.time.value`
// once updates every layer: Three.js uploads the current values to the GPU
// before each draw.
// Learn more: https://threejs.org/docs/#api/en/materials/ShaderMaterial
import { Color, SRGBColorSpace, Vector2, Vector3, type Object3D } from "three";
import type { SpacePalette } from "../palette";

/**
 * The most project systems the shaders handle (GLSL arrays need a fixed
 * size). There are 8 today; map.ts checks the limit.
 */
export const MAX_SYSTEMS = 24;

export interface SharedUniforms {
  /** Seconds of animation so far. Frozen while paused, so a still frame stays still. */
  time: { value: number };
  /** Device pixels per CSS pixel (2 on most phones), to size points in CSS pixels. */
  pixelRatio: { value: number };
  /** The canvas size in device pixels, for lines drawn in screen space. */
  resolution: { value: Vector2 };
  /** Points are sized for this camera distance; nearer looks bigger (perspective). */
  referenceDepth: { value: number };
  /** Per project system, 1 = matches the filter, 0 = dimmed (in between while fading). */
  lit: { value: number[] };
  /** 1 in light mode (daytime sky), 0 in dark mode. Shaders mix their two looks with it. */
  light: { value: number };
}

export function createSharedUniforms(): SharedUniforms {
  return {
    time: { value: 0 },
    pixelRatio: { value: 1 },
    resolution: { value: new Vector2(1, 1) },
    referenceDepth: { value: 20 },
    lit: { value: new Array<number>(MAX_SYSTEMS).fill(1) },
    light: { value: 0 },
  };
}

/**
 * A CSS color as plain red, green, blue numbers from 0 to 1, as the page
 * shows it (sRGB).
 *
 * Why not just `new Color(hex)`? Three.js converts colors to "linear" values,
 * the right space for lighting math, and its built-in materials convert back
 * when drawing. These custom shaders do no lighting and write their colors
 * straight to the screen, so they use the page's own sRGB values, which also
 * makes blending look like CSS opacity does.
 * Learn more: https://threejs.org/manual/#en/color-management
 */
export function srgb(css: string): Vector3 {
  const c = new Color(css).getRGB(new Color(), SRGBColorSpace);
  return new Vector3(c.r, c.g, c.b);
}

/** One visual layer of the map: a Three.js object plus how to recolor and free it. */
export interface Layer {
  object: Object3D;
  /** Called on start and whenever light/dark mode changes. */
  setPalette(palette: SpacePalette, light: boolean): void;
  dispose(): void;
}

/**
 * GLSL shared by several shaders: a cheap hash for per-pixel noise. Used for
 * "dithering": adding a tiny random offset to each pixel's color, which
 * breaks the visible steps ("banding") a smooth gradient shows on screens
 * with only 256 levels per color channel.
 */
export const GLSL_HASH = /* glsl */ `
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
`;
