// The floating navigation bar at the top of the screen. Its links come from
// SECTIONS in data/profile.ts, so adding a section there adds a link
// (tests/app.test.tsx checks that every link has a matching section id).
import { useEffect, useState } from "react";
import { SECTIONS } from "../data/profile";

/** Floating Liquid Glass navigation; highlights the section on screen. */
export function NavBar() {
  // useState<string | null>: the type parameter says `current` holds a section
  // id, or null for "none yet". Calling setCurrent re-renders the nav with the
  // new value. It starts as null, and effects don't run at build time, so the
  // pre-rendered HTML highlights nothing; the observer below takes over once
  // the page has hydrated.
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return; // e.g. the test DOM (jsdom)
    // IntersectionObserver reports when elements enter or leave an area of the
    // screen, without having to check on every scroll event.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setCurrent(entry.target.id);
        }
      },
      // A section counts as current while it crosses the upper-middle of the screen.
      // rootMargin shrinks the area being watched: 40% off the top and 55% off
      // the bottom leaves a thin band from 40% to 45% of the way down.
      { rootMargin: "-40% 0px -55% 0px" },
    );
    for (const { id } of SECTIONS) {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    }
    // Cleanup: stop observing when the nav goes away.
    return () => observer.disconnect();
  }, []);

  return (
    // <header> and <nav> are landmarks screen-reader users can jump between.
    // aria-label names this one "Primary".
    <header className="nav-wrap">
      <nav className="nav glass" aria-label="Primary">
        {/* aria-label replaces the visible text for screen readers: "Back to
            top" means more than "TT" read aloud. */}
        <a className="nav-brand" href="#top" aria-label="Back to top">
          TT
        </a>
        <ul className="nav-links">
          {SECTIONS.map(({ id, label }) => (
            <li key={id}>
              {/* aria-current tells screen readers which link is the current
                  location; `undefined` leaves the attribute out entirely.
                  global.css styles a[aria-current="true"], so what's announced
                  and what's highlighted can't disagree. */}
              <a href={`#${id}`} aria-current={current === id ? "true" : undefined}>
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
