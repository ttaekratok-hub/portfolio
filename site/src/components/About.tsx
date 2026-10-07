// The About and Skills sections. Both just turn data from data/profile.ts into
// markup: edit the arrays there and these sections follow.
//
// About has three sub-sections (Experience, Education, Certifications) under
// <h3> headings, so the page outline stays h1 > h2 > h3 for screen readers.
import { CERTIFICATIONS, EDUCATION, EXPERIENCE, PROFILE, SKILLS } from "../data/profile";
import { Row } from "./Lists";

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
      <div className="about-text">
        {PROFILE.about.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
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
