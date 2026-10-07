// @vitest-environment jsdom
import { existsSync } from "node:fs";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { App } from "../site/src/App";
import { FILTERS, PROJECTS } from "../site/src/data/projects";

describe("the page", () => {
  test("introduces the owner and links to the résumé", () => {
    render(<App />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Hi, I’m Tweety.");
    expect(screen.getByText(/I’m Tichakorn Taekratok\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Résumé (PDF)" })).toHaveAttribute("href", "/resume.pdf");
  });

  test("every navigation link points at a section that exists", () => {
    const { container } = render(<App />);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    for (const link of within(nav).getAllByRole("link")) {
      const id = link.getAttribute("href")!.slice(1);
      expect(container.querySelector(`#${id}`), `missing #${id}`).not.toBeNull();
    }
  });

  test("every local file the page links to exists in site/public", () => {
    const { container } = render(<App />);
    for (const a of container.querySelectorAll("a[href^='/']")) {
      const path = a.getAttribute("href")!;
      expect(existsSync(`site/public${path}`), `broken link: ${path}`).toBe(true);
    }
  });

  test("the email address appears only after hydration, as a mailto link", async () => {
    render(<App />);
    expect(await screen.findByRole("link", { name: /Email/ })).toHaveAttribute("href", "mailto:ttaekratok@gmail.com");
  });
});

describe("project filters", () => {
  test("every filter has at least one project", () => {
    for (const { id } of FILTERS) {
      expect(PROJECTS.some((p) => id === "all" || p.categories.includes(id)), id).toBe(true);
    }
  });

  test("choosing a filter shows only matching projects", async () => {
    render(<App />);
    const filters = screen.getByRole("group", { name: "Filter projects" });
    const projects = document.getElementById("projects")!;
    const titles = () => within(projects).getAllByRole("heading", { level: 3 }).map((h) => h.textContent);

    expect(titles()).toHaveLength(PROJECTS.length);
    await userEvent.click(within(filters).getByRole("button", { name: "Networking" }));
    expect(titles()).toEqual(["MikroTik OSPF Network Lab"]);
    expect(within(filters).getByRole("button", { name: "Networking" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Showing 1 project")).toBeInTheDocument();
  });
});
