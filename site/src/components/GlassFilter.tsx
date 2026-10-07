/**
 * The SVG filter behind Liquid Glass refraction (see styles/glass.css).
 * Low-frequency noise displaces the backdrop a little, so what's behind the
 * glass bends like it would through a thick, slightly uneven pane.
 */
export function GlassFilter() {
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
