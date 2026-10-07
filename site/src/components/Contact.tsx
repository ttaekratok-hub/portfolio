// The Contact section and the page footer. Both show something the
// pre-rendered HTML can't contain, and each uses a hydration-safe pattern for
// it (hydration needs the first browser render to match that HTML exactly):
//   - Contact: useIsBrowser (hooks.ts), which has a separate "server" value.
//   - Footer: state that starts empty, then an effect fills it in.
import { useEffect, useState } from "react";
import { PROFILE } from "../data/profile";
import { useIsBrowser } from "../hooks";
import { Chevron, Row } from "./Lists";

export function Contact() {
  // The email is added in the browser only, never in the pre-rendered HTML.
  // Cloudflare's email obfuscation rewrites any address it finds in the HTML
  // into an encoded link plus a decoder script, so React would hydrate HTML
  // that no longer matches what it renders (a hydration mismatch). Scrapers
  // that only read the HTML don't see it either. It's still in the JavaScript
  // bundle, so this deters casual harvesting rather than hiding it.
  // tests/prerender.test.ts checks that the address stays out of the HTML.
  const email = useIsBrowser() ? PROFILE.email : null;

  return (
    <section className="section contact" id="contact" aria-labelledby="contact-title">
      <h2 className="section-title" id="contact-title">
        Contact
      </h2>
      <p className="section-intro">
        Based in {PROFILE.location}. {PROFILE.relocation}
      </p>
      <p className="contact-note">{PROFILE.workStatus}</p>
      {/* An inset grouped list, like iOS Settings. A link row is a single <a>,
          so the whole row is the tap target. */}
      <ul className="grouped">
        <li>
          {/* condition ? A : B picks what to render. Pre-rendered: plain text
              with " at " instead of "@". In the browser: a mailto: link. */}
          {email ? (
            <a className="grouped-row" href={`mailto:${email}`}>
              <Row title="Email" detail={email} />
              <Chevron />
            </a>
          ) : (
            <div className="grouped-row">
              <Row title="Email" detail={PROFILE.email.replace("@", " at ")} />
            </div>
          )}
        </li>
        <li>
          {/* Props can be JSX too: here a <span> that keeps the number on one line. */}
          <a className="grouped-row" href={PROFILE.phone.href}>
            <Row title="Phone" detail={<span className="nowrap">{PROFILE.phone.display}</span>} />
            <Chevron />
          </a>
        </li>
        <li>
          <a className="grouped-row" href={PROFILE.linkedin}>
            <Row title="LinkedIn" detail={PROFILE.linkedin.split("/in/")[1]} />
            <Chevron />
          </a>
        </li>
        <li>
          <a className="grouped-row" href={PROFILE.github}>
            <Row title="GitHub" detail="ttaekratok-hub" />
            <Chevron />
          </a>
        </li>
      </ul>
    </section>
  );
}

/**
 * The footer, ending with the commit that's live, e.g. "Build 1a2b3c4.".
 * The pre-rendered HTML can't know that: the Dockerfile's final stage writes
 * version.json from the commit SHA that CI passes in, after the site is built.
 */
export function Footer() {
  // useState returns the current value and a setter. Calling the setter makes
  // React render the component again with the new value. It starts as "", which
  // matches the pre-rendered HTML, so hydration succeeds.
  const [build, setBuild] = useState("");
  useEffect(() => {
    // fetch() resolves even for a 404, so check r.ok. Any failure (there's no
    // version.json in `npm run dev`, the network is down, the JSON is bad) is
    // ignored: the footer just shows no build. nginx.conf sends version.json
    // with `expires -1`, so browsers re-check it instead of caching an old one.
    // In development StrictMode runs this effect twice, so it may fetch twice;
    // that's harmless, because both set the same text.
    fetch("/version.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((v: { commit?: string } | null) => v?.commit && setBuild(` Build ${v.commit.slice(0, 7)}.`))
      .catch(() => {});
  }, []);

  return (
    <footer className="footer">
      <p>
        © {PROFILE.name}. Shipped with React, Docker, Kubernetes (k3s), Flux and GitHub Actions.{build}
      </p>
    </footer>
  );
}
