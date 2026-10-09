// The About and Skills sections. Both just turn data from data/profile.ts into
// markup: edit the arrays there and these sections follow.
//
// About opens with the text and an "At a glance" card side by side, then has
// three sub-sections (Experience, Education, Certifications). All four use
// <h3> headings, so the page outline stays h1 > h2 > h3 for screen readers.
import type { ReactNode } from "react";
import { CERTIFICATIONS, EDUCATION, EXPERIENCE, GLANCE, PROFILE, SKILLS, type GlanceIcon } from "../data/profile";
import { Row } from "./Lists";

// The line drawings for the "At a glance" rows, on a 24 x 24 grid. The stroke
// color, width and line caps come from .glance-icon in global.css.
const ICONS: Record<GlanceIcon, ReactNode> = {
  pin: (
    <>
      <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  plane: <path d="M21 3 3 10.5l7.5 3L14 21zM10.5 13.5 15 9" />,
  id: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <circle cx="9" cy="11" r="2" />
      <path d="M5.5 16.5c.7-1.3 1.9-2 3.5-2s2.8.7 3.5 2M15 10h3.5M15 13.5h2.5" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2.5" />
      <path d="M8.5 7V5.5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2V7M3 13h18" />
    </>
  ),
  cap: <path d="m2 9.5 10-5 10 5-10 5zM6 11.5v4.5c0 1.6 2.7 3 6 3s6-1.4 6-3v-4.5M22 9.5V15" />,
};

export function About() {
  return (
    // aria-labelledby points at the heading's id, so screen readers announce
    // the section as "About" and list it as a landmark.
    <section className="section" id="about" aria-labelledby="about-title">
      <h2 className="section-title" id="about-title">
        About
      </h2>
      {/* Rendering a list: map() turns each array item into an element. React
          needs a `key` that's unique among siblings to match items between
          renders; each paragraph's text is unique, so it serves as the key.
          Learn more: https://react.dev/learn/rendering-lists */}
      <div className="about-intro">
        <div className="about-text">
          {PROFILE.about.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>

        {/* A description list (<dl>): each <dt> is a label, the <dd> after it
            its value. A <div> may wrap each pair, which lets CSS lay a pair
            out as one row. The icons are decoration (aria-hidden): the label
            already says the same in words. */}
        <aside className="card glance" aria-labelledby="glance-title">
          <h3 className="glance-title" id="glance-title">
            At a glance
          </h3>
          <dl className="glance-list">
            {GLANCE.map(({ icon, label, value }) => (
              <div className="glance-row" key={label}>
                <dt>
                  <svg className="glance-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    {ICONS[icon]}
                  </svg>
                  {label}
                </dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <a className="glance-link" href="/resume.pdf">
            Download résumé (PDF)
          </a>
        </aside>
      </div>

      <h3 className="subsection-title">Experience</h3>
      <ul className="stack">
        {EXPERIENCE.map((job) => (
          <li className="card" key={job.title}>
            <div className="card-heading">
              <h4 className="card-title">{job.title}</h4>
              <p className="card-meta">{job.when}</p>
            </div>
            <p className="card-subtitle">{job.org}</p>
            <ul className="points">
              {job.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            {/* links is optional: `&&` renders the row only when it exists. */}
            {job.links && (
              <p className="card-links">
                {job.links.map((link) => (
                  <a key={link.href} href={link.href}>
                    {link.label}
                    <span aria-hidden="true"> ↗</span>
                  </a>
                ))}
              </p>
            )}
          </li>
        ))}
      </ul>

      <h3 className="subsection-title">Education</h3>
      <ul className="stack">
        {EDUCATION.map((school) => (
          <li className="card" key={school.school}>
            <div className="card-heading">
              <h4 className="card-title">{school.school}</h4>
              <p className="card-meta">{school.when}</p>
            </div>
            <p className="card-subtitle">{school.degree}</p>
            <ul className="points">
              {school.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <ul className="tags" aria-label={`Coursework at ${school.school}`}>
              {school.coursework.map((course) => (
                <li key={course}>{course}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      <h3 className="subsection-title">Certifications</h3>
      <ul className="grouped timeline" aria-label="Certifications">
        {CERTIFICATIONS.map((cert) => (
          <li key={cert.name}>
            <div className="grouped-row">
              <Row title={cert.name} subtitle={cert.org} detail={cert.status} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Skills() {
  return (
    <section className="section" id="skills" aria-labelledby="skills-title">
      <h2 className="section-title" id="skills-title">
        Skills
      </h2>
      {/* ({ group, items }) unpacks each object as it arrives. A list inside a
          list: one card per group, one tag per skill. */}
      <ul className="skills-grid">
        {SKILLS.map(({ group, items }) => (
          <li className="card" key={group}>
            <h3 className="card-title">{group}</h3>
            <ul className="tags" aria-label={group}>
              {items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
