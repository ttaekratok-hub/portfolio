// The About and Skills sections. Both just turn data from data/profile.ts into
// markup: edit the arrays there and these sections follow.
import { PROFILE, SKILLS, TIMELINE } from "../data/profile";
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
      {/* aria-label names the list, so screen readers can announce what it
          holds before reading the items. */}
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
