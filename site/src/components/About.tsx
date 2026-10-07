import { PROFILE, SKILLS, TIMELINE } from "../data/profile";
import { Row } from "./Lists";

export function About() {
  return (
    <section className="section" id="about" aria-labelledby="about-title">
      <h2 className="section-title" id="about-title">
        About
      </h2>
      <div className="about-text">
        {PROFILE.about.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      <ul className="grouped timeline" aria-label="Experience and education">
        {TIMELINE.map((item) => (
          <li key={item.title}>
            <div className="grouped-row">
              <Row title={item.title} subtitle={item.org} detail={item.when} />
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
