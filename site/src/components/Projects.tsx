import { useState } from "react";
import { FILTERS, PROJECTS, type Filter, type Project } from "../data/projects";

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
      {project.links.length > 0 && (
        <p className="card-links">
          {project.links.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
              {/* Screen readers list links out of context: "Code for This Portfolio". */}
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
  const [filter, setFilter] = useState<Filter>("all");
  const visible = PROJECTS.filter((p) => filter === "all" || p.categories.includes(filter));

  return (
    <section className="section" id="projects" aria-labelledby="projects-title">
      <h2 className="section-title" id="projects-title">
        Projects
      </h2>
      {/* A segmented control: a floating control, so it gets the glass material. */}
      <div className="segmented-scroller">
        <div className="segmented glass" role="group" aria-label="Filter projects">
          {FILTERS.map(({ id, label }) => (
            <button key={id} type="button" className="segment" aria-pressed={filter === id} onClick={() => setFilter(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="visually-hidden" aria-live="polite">
        {filter === "all" ? "" : `Showing ${visible.length} ${visible.length === 1 ? "project" : "projects"}`}
      </p>
      <ul className="card-grid">
        {visible.map((project) => (
          <ProjectCard key={project.title} project={project} />
        ))}
      </ul>
    </section>
  );
}
