// The first screen: a greeting and two calls to action, over the galaxy that
// SpaceBackground.tsx draws behind the whole page. The text comes from
// data/profile.ts.
import { PROFILE } from "../data/profile";

export function Hero() {
  return (
    // aria-labelledby names this section after its heading. A <section> with a
    // name becomes a landmark (a "region") that screen-reader users can jump
    // to. id="top" is where the nav's "TT" link goes.
    <section className="hero" id="top" aria-labelledby="hero-title">
      <div className="hero-content">
        {/* Curly braces put a JavaScript value into JSX. React escapes text, so
            a value can never inject HTML or scripts into the page. */}
        <p className="eyebrow">{PROFILE.role}</p>
        {/* The page's only <h1>. Sections use <h2> and cards <h3>, an outline
            that screen-reader users navigate by. */}
        <h1 className="display" id="hero-title">
          Hi, I’m <span className="gradient-text">{PROFILE.nickname}</span>.
        </h1>
        <p className="lede">
          I’m {PROFILE.name}. {PROFILE.intro}
        </p>
        {/* Links styled as buttons: they go somewhere, so they stay <a>.
            <button> is for actions on the page, like the project filters. */}
        <div className="cta">
          <a className="button button-filled" href="#projects">
            See my work
          </a>
          {/* site/public/ is copied into the site as-is, so /resume.pdf is
              site/public/resume.pdf. tests/app.test.tsx fails if a local link
              points at a missing file. button-gray, not glass: this button
              scrolls with the page, and Liquid Glass is only for controls that
              float above it (global.css explains). */}
          <a className="button button-gray" href="/resume.pdf">
            Résumé (PDF)
          </a>
        </div>
      </div>
    </section>
  );
}
