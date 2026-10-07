import { PROFILE } from "../data/profile";
import { FlowField } from "./FlowField";

export function Hero() {
  return (
    <section className="hero" id="top" aria-labelledby="hero-title">
      <FlowField />
      <div className="hero-content">
        <p className="eyebrow">{PROFILE.role}</p>
        <h1 className="display" id="hero-title">
          Hi, I’m <span className="gradient-text">{PROFILE.nickname}</span>.
        </h1>
        <p className="lede">
          I’m {PROFILE.name}. {PROFILE.intro}
        </p>
        <div className="cta">
          <a className="button button-filled" href="#projects">
            See my work
          </a>
          <a className="button button-glass glass" href="/resume.pdf">
            Résumé (PDF)
          </a>
        </div>
      </div>
    </section>
  );
}
