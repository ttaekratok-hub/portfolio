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
    // screen, without having to check on every scroll event. The hero (#top)
    // is watched too: when it's back in view, no section is current.
    // The last section can be too short to ever reach that band on a tall
    // screen, because the page can't scroll any further. So scrolled all the
    // way down also counts as "the last section is current". It's checked after
    // every observer callback and scroll event: an instant jump (Reduce Motion,
    // a #contact link) fires both, and the observer's report arrives last.
    const lastId = SECTIONS[SECTIONS.length - 1]!.id;
    const atBottom = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setCurrent(entry.target.id === "top" ? null : entry.target.id);
        }
        if (atBottom()) setCurrent(lastId);
      },
      // A section counts as current while it crosses the upper-middle of the screen.
      // rootMargin shrinks the area being watched: 40% off the top and 55% off
      // the bottom leaves a thin band from 40% to 45% of the way down.
      { rootMargin: "-40% 0px -55% 0px" },
    );
    for (const id of ["top", ...SECTIONS.map((s) => s.id)]) {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    }
    // { passive: true } promises the listener never cancels scrolling, so the
    // browser can scroll smoothly without waiting for it. Called once right
    // away too, for a page opened at #contact or a restored scroll position.
    const onScroll = () => {
      if (atBottom()) setCurrent(lastId);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    // Cleanup: stop observing and listening when the nav goes away.
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    // <header> and <nav> are landmarks screen-reader users can jump between.
    // aria-label names this one "Primary".
    <header className="nav-wrap">
      <nav className="nav glass" aria-label="Primary">
        {/* The accessible name is "TT, back to top": it starts with the visible
            text, so someone using voice control can say "click TT" (WCAG 2.5.3,
            Label in Name), and the hidden part explains where it goes. */}
        <a className="nav-brand" href="#top">
          TT<span className="visually-hidden">, back to top</span>
        </a>
        <ul className="nav-links">
          {SECTIONS.map(({ id, label }) => (
            <li key={id}>
              {/* aria-current tells screen readers which link is the current
                  location; `undefined` leaves the attribute out entirely.
                  global.css styles a[aria-current="true"], so what's announced
                  and what's highlighted can't disagree. */}
              <a href={`#${id}`} aria-current={current === id ? "true" : undefined} onClick={() => setCurrent(id)}>
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
