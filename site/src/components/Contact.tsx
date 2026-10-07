import { useEffect, useState, useSyncExternalStore } from "react";
import { PROFILE } from "../data/profile";
import { Chevron, Row } from "./Lists";

const noSubscription = () => () => {};

/** false while pre-rendering and hydrating, true once running in the browser. */
function useIsBrowser(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}

export function Contact() {
  // The email is added in the browser only, never in the pre-rendered HTML:
  // Cloudflare's email obfuscation would otherwise rewrite that HTML before
  // React hydrates it, and scrapers that don't run JavaScript never see it.
  const email = useIsBrowser() ? PROFILE.email : null;

  return (
    <section className="section contact" id="contact" aria-labelledby="contact-title">
      <h2 className="section-title" id="contact-title">
        Contact
      </h2>
      <p className="section-intro">
        Open to software engineering, infrastructure and technical artist roles. Based in {PROFILE.location}.
      </p>
      <ul className="grouped">
        <li>
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
          <a className="grouped-row" href={PROFILE.phone.href}>
            <Row title="Phone" detail={<span className="nowrap">{PROFILE.phone.display}</span>} />
            <Chevron />
          </a>
        </li>
        <li>
          <a className="grouped-row" href={PROFILE.linkedin}>
            <Row title="LinkedIn" detail="tichakorn-taekratok" />
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

export function Footer() {
  const [build, setBuild] = useState("");
  useEffect(() => {
    // version.json is written into the image by CI (see Dockerfile).
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
