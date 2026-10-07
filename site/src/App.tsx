import { useEffect } from "react";
import "@fontsource-variable/inter";
import "./styles/tokens.css";
import "./styles/glass.css";
import "./styles/global.css";
import { About, Skills } from "./components/About";
import { Art } from "./components/Art";
import { Contact, Footer } from "./components/Contact";
import { GlassFilter } from "./components/GlassFilter";
import { Hero } from "./components/Hero";
import { NavBar } from "./components/NavBar";
import { Projects } from "./components/Projects";

type NavigatorWithUAData = Navigator & { userAgentData?: { brands: Array<{ brand: string }> } };

export function App() {
  useEffect(() => {
    // Refraction needs SVG filters in backdrop-filter, which only Chromium
    // renders; elsewhere the glass keeps its frosted blur (styles/glass.css).
    const chromium = (navigator as NavigatorWithUAData).userAgentData?.brands.some((b) => b.brand === "Chromium");
    const reduceTransparency = window.matchMedia?.("(prefers-reduced-transparency: reduce)").matches;
    if (chromium && !reduceTransparency) document.documentElement.dataset.refraction = "";
  }, []);

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <GlassFilter />
      <NavBar />
      <main id="main">
        <Hero />
        <Projects />
        <Art />
        <About />
        <Skills />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
