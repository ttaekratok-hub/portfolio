import { useEffect, useState } from "react";
import { SECTIONS } from "../data/profile";

/** Floating Liquid Glass navigation; highlights the section on screen. */
export function NavBar() {
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setCurrent(entry.target.id);
        }
      },
      // A section counts as current while it crosses the upper-middle of the screen.
      { rootMargin: "-40% 0px -55% 0px" },
    );
    for (const { id } of SECTIONS) {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <header className="nav-wrap">
      <nav className="nav glass" aria-label="Primary">
        <a className="nav-brand" href="#top" aria-label="Back to top">
          TT
        </a>
        <ul className="nav-links">
          {SECTIONS.map(({ id, label }) => (
            <li key={id}>
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
