// The root component: the whole page, section by section, in reading order.
// Both entry points render it: main.tsx in the browser, entry-server.tsx at
// build time. Each section is its own component in components/, and the words
// come from data/profile.ts and data/projects.ts.
//
// A React component is a function that returns JSX: HTML-like syntax that
// compiles to plain function calls describing what should be on screen. React
// turns that description into DOM in the browser, or into an HTML string when
// pre-rendering. Learn more: https://react.dev/learn/your-first-component
import { useEffect } from "react";
// Importing CSS from a component is a Vite feature: the build gathers these
// files into one hashed stylesheet in dist/assets/ and links it from
// index.html. tokens.css holds the design tokens: named CSS variables
// (--label, --bg, --space-4...) for colors, type sizes and spacing, with light
// and dark values for every color. The Inter font comes from npm and is served
// from this site rather than a font CDN, so the strict Content-Security-Policy
// in nginx.conf (`default-src 'self'`: load only from this site) allows it.
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

// navigator.userAgentData (User-Agent Client Hints) exists only in Chromium
// browsers and isn't in TypeScript's built-in DOM types, so this adds it.
// `A & B` is an intersection type: "a Navigator that may also have userAgentData".
type NavigatorWithUAData = Navigator & { userAgentData?: { brands: Array<{ brand: string }> } };

export function App() {
  // useEffect runs after React has updated the page, and only in the browser
  // (never while pre-rendering). The empty dependency array [] means "once,
  // after the first render". It changes <html>, which is outside React's #root,
  // so it can't make hydration fail.
  // Learn more: https://react.dev/learn/synchronizing-with-effects
  useEffect(() => {
    // Refraction needs SVG filters in backdrop-filter, which only Chromium
    // renders; elsewhere the glass keeps its frosted blur (styles/glass.css).
    // CSS can't ask which browser it's in, so this sets data-refraction on
    // <html> and glass.css switches on `:root[data-refraction] .glass`.
    // `?.` (optional chaining) gives undefined instead of throwing when
    // something is missing: Safari and Firefox have no userAgentData, and the
    // test DOM (jsdom) has no matchMedia.
    const chromium = (navigator as NavigatorWithUAData).userAgentData?.brands.some((b) => b.brand === "Chromium");
    const reduceTransparency = window.matchMedia?.("(prefers-reduced-transparency: reduce)").matches;
    if (chromium && !reduceTransparency) document.documentElement.dataset.refraction = "";
  }, []);

  // <>...</> is a fragment: it groups elements without adding a wrapper <div>.
  return (
    <>
      {/* The first stop for keyboard users: Tab, then Enter, jumps past the
          navigation to <main>. global.css keeps it off-screen until focused. */}
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {/* Rendered once; on Chromium, glass.css points every .glass element at
          it by id: url(#liquid-glass). */}
      <GlassFilter />
      <NavBar />
      {/* <main> is a landmark: screen-reader users can jump straight to it. */}
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
