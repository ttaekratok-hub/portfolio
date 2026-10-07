import type { ReactNode } from "react";

/** The ">" at the end of a tappable row, as in iOS Settings. */
export function Chevron() {
  return (
    <svg className="chevron" viewBox="0 0 8 14" aria-hidden="true" focusable="false">
      <path d="M1 1l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** One row of an inset grouped list: title, optional subtitle, trailing detail. */
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
