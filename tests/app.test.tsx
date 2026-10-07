// @vitest-environment jsdom
// That first line makes Vitest run this file in jsdom, a simulated browser
// DOM, instead of plain Node (see vitest.config.ts).
//
// Integration tests for the whole page: each test renders the real <App />,
// with all its sections, and checks what a visitor would see or do, rather
// than testing components one by one.
//
// They use Testing Library, which finds elements the way people do: by role
// (heading, link, button, navigation) and accessible name, the same
// information a screen reader announces. Not by CSS class or component
// internals, so restyling or restructuring the code doesn't break a test as
// long as the page works the same. It also doubles as an accessibility check:
// a button with no accessible name can't be found by name.
//   getBy...   returns the element, or fails the test right away if missing
//   findBy...  waits for it (up to 1 second by default); returns a Promise
//   screen     searches the whole document; within(el) only inside el
// Learn more: https://testing-library.com/docs/queries/about
import { existsSync } from "node:fs";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { App } from "../site/src/App";
import { FILTERS, PROJECTS } from "../site/src/data/projects";

describe("the page", () => {
  // The first things a recruiter looks for: who this is, and the résumé.
  test("introduces the owner and links to the résumé", () => {
    render(<App />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Hi, I’m Tweety.");
    expect(screen.getByText(/I’m Tichakorn Taekratok\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Résumé (PDF)" })).toHaveAttribute("href", "/resume.pdf");
  });

  // An in-page link like href="#projects" jumps to the element with
  // id="projects". Renaming a section's id would quietly break its nav link.
  test("every navigation link points at a section that exists", () => {
    // render() also returns `container`, the <div> the page was rendered into,
    // for the few checks that need plain DOM queries like querySelector.
    const { container } = render(<App />);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    for (const link of within(nav).getAllByRole("link")) {
      // "#projects" -> "projects". The `!` is safe: only an <a> with an href
      // has the link role.
      const id = link.getAttribute("href")!.slice(1);
      // expect's second argument is the message shown if the check fails.
      expect(container.querySelector(`#${id}`), `missing #${id}`).not.toBeNull();
    }
  });

  // Vite copies site/public/ to the site's root unchanged, so href="/resume.pdf"
  // is served from site/public/resume.pdf. This catches a renamed or missing
  // file before it ships. (The path is relative to the repo root, where
  // `npm test` runs.)
  test("every local file the page links to exists in site/public", () => {
    const { container } = render(<App />);
    for (const a of container.querySelectorAll("a[href^='/']")) {
      const path = a.getAttribute("href")!;
      expect(existsSync(`site/public${path}`), `broken link: ${path}`).toBe(true);
    }
  });

  // Contact.tsx adds the email link only in the browser (useIsBrowser). There's
  // no pre-rendered HTML to hydrate here, because render() starts React with
  // createRoot, so the link is there from the first render; findByRole would
  // also wait for it. tests/prerender.test.ts checks the other half: the
  // address is missing from the pre-rendered HTML.
  test("the email address appears only after hydration, as a mailto link", async () => {
    render(<App />);
    expect(await screen.findByRole("link", { name: /Email/ })).toHaveAttribute("href", "mailto:ttaekratok@gmail.com");
  });
});

describe("project filters", () => {
  // A check on the data alone, no rendering: a filter with no projects would
  // show an empty grid.
  test("every filter has at least one project", () => {
    for (const { id } of FILTERS) {
      expect(PROJECTS.some((p) => id === "all" || p.categories.includes(id)), id).toBe(true);
    }
  });

  // React's core loop, end to end: a click changes state, React re-renders,
  // and the page shows the result.
  test("choosing a filter shows only matching projects", async () => {
    render(<App />);
    const filters = screen.getByRole("group", { name: "Filter projects" });
    const projects = document.getElementById("projects")!;
    // A function, not a variable, so each call reads the page as it is now.
    const titles = () => within(projects).getAllByRole("heading", { level: 3 }).map((h) => h.textContent);

    expect(titles()).toHaveLength(PROJECTS.length);
    // userEvent acts like a real user: a click sends the whole series of
    // events a browser would (pointerdown, mousedown, focus, pointerup,
    // mouseup, click), not just one "click" event. It's async, so the test
    // awaits it.
    await userEvent.click(within(filters).getByRole("button", { name: "Networking" }));
    expect(titles()).toEqual(["MikroTik OSPF Network Lab"]);
    // aria-pressed is how screen readers learn which filter is on.
    expect(within(filters).getByRole("button", { name: "Networking" })).toHaveAttribute("aria-pressed", "true");
    // The visually hidden live region that announces the result.
    expect(screen.getByText("Showing 1 project")).toBeInTheDocument();
  });
});
