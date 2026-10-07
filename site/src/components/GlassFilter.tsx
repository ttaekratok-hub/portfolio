/**
 * The SVG filter behind Liquid Glass refraction (see styles/glass.css).
 * Low-frequency noise displaces the backdrop a little, so what's behind the
 * glass bends like it would through a thick, slightly uneven pane.
 *
 * How it connects: App.tsx renders this once. On Chromium, App.tsx also sets
 * data-refraction on <html>, and glass.css then adds url(#liquid-glass) to the
 * backdrop-filter of every .glass element. backdrop-filter applies effects to
 * whatever is behind an element (here blur, saturation and this filter), not
 * to the element itself.
 *
 * The filter is a small pipeline; each step names its output (`result`) and
 * the next step reads it (`in`, `in2`):
 *   feTurbulence       draws a cloudy noise image. A low baseFrequency means
 *                      large, gentle blobs; a fixed seed means the same
 *                      pattern on every load.
 *   feGaussianBlur     smooths the noise, so the bends have no sharp edges.
 *   feDisplacementMap  shifts each pixel of the input (SourceGraphic, which is
 *                      the backdrop here) sideways by the noise's red channel
 *                      and up or down by its green channel; scale sets how far.
 * Learn more: https://developer.mozilla.org/en-US/docs/Web/SVG/Element/feDisplacementMap
 */
export function GlassFilter() {
  // The SVG draws nothing itself (glass.css gives it zero size). aria-hidden
  // hides it from screen readers; focusable="false" stops older Edge and IE
  // from making it a Tab stop. JSX writes SVG attributes in camelCase
  // (colorInterpolationFilters) and React outputs the real names
  // (color-interpolation-filters).
  return (
    <svg className="glass-filter" aria-hidden="true" focusable="false">
      <filter id="liquid-glass" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.006 0.009" numOctaves={2} seed={7} result="noise" />
        <feGaussianBlur in="noise" stdDeviation={2} result="smoothNoise" />
        <feDisplacementMap in="SourceGraphic" in2="smoothNoise" scale={36} xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}
