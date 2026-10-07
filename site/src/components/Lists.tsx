// Building blocks for iOS-Settings-style "inset grouped" lists, shared by
// About.tsx (the timeline) and Contact.tsx (the contact rows).
import type { ReactNode } from "react";

/**
 * The ">" at the end of a tappable row, as in iOS Settings.
 * Decoration only: aria-hidden keeps screen readers from announcing it, since
 * the row's text already says where it goes. stroke="currentColor" draws it in
 * the element's CSS color, which global.css sets to --label-secondary (a token
 * with light and dark values), so it follows light and dark mode.
 */
export function Chevron() {
  return (
    <svg className="chevron" viewBox="0 0 8 14" aria-hidden="true" focusable="false">
      <path d="M1 1l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * One row of an inset grouped list: title, optional subtitle, trailing detail.
 *
 * Props are a component's inputs, written like HTML attributes:
 * <Row title="Email" detail="..." />. `{ title, subtitle, detail }` unpacks
 * them (destructuring), and the type after the colon describes them: `?` marks
 * an optional prop, and ReactNode means anything React can render (text,
 * numbers, JSX elements, null).
 * It returns a fragment (<>...</>) rather than one wrapper element, so the
 * caller picks the wrapper: a <div>, or an <a> when the whole row is a link.
 * `{subtitle && ...}` renders the subtitle only when one is given.
 * Learn more: https://react.dev/learn/passing-props-to-a-component
 */
export function Row({ title, subtitle, detail }: { title: ReactNode; subtitle?: ReactNode; detail?: ReactNode }) {
  return (
    <>
      <span className="row-main">
        <span className="row-title">{title}</span>
        {subtitle && <span className="row-subtitle">{subtitle}</span>}
      </span>
      {detail && <span className="row-detail">{detail}</span>}
    </>
  );
}
