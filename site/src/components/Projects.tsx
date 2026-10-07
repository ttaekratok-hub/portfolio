// The Projects section: a filter control above a grid of project cards, built
// from data/projects.ts. It's the clearest example on the page of React's core
// loop: a click calls setFilter(), React runs Projects() again with the new
// value, compares the result with what's on screen, and updates only the DOM
// that changed.
// `type` marks imports that are only types. They're erased from the
// JavaScript, and tsconfig's verbatimModuleSyntax requires the marker.
import { useState } from "react";
import { FILTERS, PROJECTS, type Filter, type Project } from "../data/projects";

// Used only in this file, so it isn't exported. `{ project }: { project: Project }`
// unpacks the props and types them with the Project interface.
function ProjectCard({ project }: { project: Project }) {
  return (
    <li className="card">
      <h3 className="card-title">{project.title}</h3>
      <p className="card-body">{project.summary}</p>
      <ul className="tags" aria-label="Built with">
        {project.tech.map((tech) => (
          <li key={tech}>{tech}</li>
        ))}
      </ul>
      {/* `> 0` matters: with `{project.links.length && ...}` an empty list
          would render a literal "0", while false renders nothing. */}
      {project.links.length > 0 && (
        <p className="card-links">
          {project.links.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
              {/* Screen readers list links out of context: "Code for This Portfolio".
                  Without the hidden text, that list would hold several identical
                  "Code" links. visually-hidden (global.css) hides it on screen,
                  but screen readers still read it. The arrow is decoration, so
                  aria-hidden skips it. */}
              <span className="visually-hidden"> for {project.title}</span>
              <span aria-hidden="true"> ↗</span>
            </a>
          ))}
        </p>
      )}
    </li>
  );
}

export function Projects() {
  // The type parameter limits `filter` to the Filter union from
  // data/projects.ts, so setFilter("devop") would be a compile error.
  const [filter, setFilter] = useState<Filter>("all");
  // Derived during render rather than kept in state: it can always be computed
  // from `filter`, and a second piece of state could drift out of sync.
  // Learn more: https://react.dev/learn/choosing-the-state-structure
  const visible = PROJECTS.filter((p) => filter === "all" || p.categories.includes(filter));
  // What the live region announces. Every choice gets its own wording, because
  // screen readers only speak when the text actually changes: "Showing 1
  // project" for two different filters in a row would be announced once.
  const label = FILTERS.find((f) => f.id === filter)!.label;
  const count = `${visible.length} ${visible.length === 1 ? "project" : "projects"}`;
  const status = filter === "all" ? `Showing all ${count}` : `Showing ${visible.length} ${label} ${visible.length === 1 ? "project" : "projects"}`;

  return (
    <section className="section" id="projects" aria-labelledby="projects-title">
      <h2 className="section-title" id="projects-title">
        Projects
      </h2>
      {/* A segmented control, styled like iOS's in-content one (a gray track, not
          Liquid Glass: it scrolls with the page; see global.css).
          Each button is a toggle: aria-pressed tells screen readers whether it's
          on, and global.css styles .segment[aria-pressed="true"], so the state
          and the look come from one attribute. role="group" plus aria-label
          names the set. type="button" is explicit because a button's default
          type is "submit", which would submit any form around it. onClick gets
          an arrow function, so setFilter(id) runs on click, not during render.
          On narrow screens .segmented-scroller lets the row scroll sideways, and
          onFocus scrolls a keyboard-focused button fully into view (Chromium
          doesn't for a partly visible one). "nearest" scrolls as little as
          possible; the `?.` skips it in the test DOM, which lacks the method. */}
      <div className="segmented-scroller">
        <div className="segmented" role="group" aria-label="Filter projects">
          {FILTERS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className="segment"
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
              onFocus={(e) => e.currentTarget.scrollIntoView?.({ block: "nearest", inline: "nearest" })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {/* A live region: when its text changes, screen readers announce it
          ("Showing 1 Networking project") without moving focus. "polite" waits until the
          reader is idle. Screen readers don't announce a live region's text on
          page load, only later changes, so "Showing all 4 projects" is silent
          until a filter is chosen. */}
      <p className="visually-hidden" aria-live="polite">
        {status}
      </p>
      {/* key gives each card a stable identity, so when the filter changes React
          knows which cards stayed, left or arrived. Titles are unique, so they
          work as keys. Learn more: https://react.dev/learn/rendering-lists */}
      <ul className="card-grid">
        {visible.map((project) => (
          <ProjectCard key={project.title} project={project} />
        ))}
      </ul>
    </section>
  );
}
