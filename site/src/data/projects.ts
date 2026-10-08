// Add or edit projects here. TypeScript checks every entry, so a typo in a
// category or a missing field fails `npm run lint` before it reaches the site.
// (lint runs `tsc`, the type checker. `npm run build` alone wouldn't catch it:
// Vite strips the types without checking them, so CI runs lint before building.)
//
// Everything here comes from the owner's verified project list. Don't add
// claims (numbers, tools, results) that aren't confirmed.
//
// Try it: change a category below to "devop" and run `npx tsc`.
// Learn more: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html

// A union of string literals: a Category is exactly one of these strings and
// nothing else. Unlike an enum, it adds no code at runtime, because types are
// erased. Filter is every Category plus "all", for the "show everything" button.
export type Category = "infrastructure" | "networking" | "software" | "embedded" | "techart";
export type Filter = Category | "all";

// The buttons of the filter control in Projects.tsx, in order. Every filter
// needs at least one project, or it would show an empty grid
// (tests/app.test.tsx checks this).
export const FILTERS: ReadonlyArray<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "infrastructure", label: "Cloud & DevOps" },
  { id: "networking", label: "Networking" },
  { id: "software", label: "Software" },
  { id: "embedded", label: "Embedded" },
  { id: "techart", label: "Tech Art" },
];

// An interface describes an object's shape. Fields marked `?` are optional.
//   highlights  short bullet points: what was built, a challenge solved
//   status      shown as a badge, e.g. "In progress"
//   diagram     which architecture diagram (components/Diagrams.tsx) to show;
//               a project with one gets a full-width card
export interface Project {
  title: string;
  year: string;
  summary: string;
  highlights?: string[];
  status?: "In progress";
  categories: Category[];
  tech: string[];
  links: Array<{ label: "Code" | "Docs" | "Live"; href: string }>;
  diagram?: "k3s" | "network-lab";
}

// Strongest first. Annotated as Project[] so each entry is checked right here,
// and an error points at the entry with the typo.
export const PROJECTS: Project[] = [
  {
    title: "Production Linux & Kubernetes Platform",
    year: "2026",
    summary:
      "A self-hosted Kubernetes (k3s) cluster serving live client-facing production sites. I own deployment, troubleshooting, upgrades and maintenance.",
    highlights: [
      "Commit-to-production CI/CD in GitHub Actions, with automated build and test stages gating every release",
      "Encrypted off-site backups to Amazon S3, with tested restore procedures",
      "This portfolio runs on it",
    ],
    categories: ["infrastructure"],
    tech: ["k3s", "Docker", "GitHub Actions", "AWS S3", "Linux"],
    links: [],
    diagram: "k3s",
  },
  {
    title: "MikroTik OSPF Network Lab",
    year: "2026",
    status: "In progress",
    summary:
      "Two MikroTik routers (RouterOS v7 CHR) on isolated Proxmox VE bridges running OSPF, plus DNS, SNMP and firewall rules, tested from a Kali Linux client. BGP is a stretch goal.",
    categories: ["networking"],
    tech: ["RouterOS v7", "Proxmox VE", "OSPF", "Kali Linux"],
    links: [],
    diagram: "network-lab",
  },
  {
    title: "Public Issue-Reporting App",
    year: "2024 – 2025",
    summary:
      "My year-long senior capstone at Oregon State. I led a 5-person team, gathered requirements from the external stakeholder, Pacific Power, and coordinated delivery. The app earned Pacific Power’s official endorsement.",
    categories: ["software"],
    tech: ["Flutter", "Dart", "Firebase (NoSQL)"],
    links: [],
  },
  {
    title: "STM32 Real-Time Line-Following Robot",
    year: "2020 – 2021",
    summary:
      "Bare-metal C firmware for a line-following robot, built as part of a team at KMITL: sensor acquisition, real-time control logic and motor actuation.",
    highlights: ["Debugged timing and sensor-noise issues on real hardware"],
    categories: ["embedded"],
    tech: ["C", "STM32", "Bare-metal firmware"],
    links: [],
  },
  {
    title: "This Portfolio",
    year: "2026",
    summary:
      "React and TypeScript, pre-rendered at build time and served by nginx. Tested in CI on a throwaway Kubernetes cluster, then deployed to my k3s cluster by Flux (GitOps) in a locked-down namespace behind a Cloudflare Tunnel.",
    categories: ["infrastructure", "software"],
    tech: ["React", "TypeScript", "Docker", "Kubernetes", "Flux", "GitHub Actions"],
    links: [{ label: "Code", href: "https://github.com/ttaekratok-hub/portfolio" }],
  },
  {
    title: "Infrastructure as Code",
    year: "OSU, CS 312",
    summary: "System Administration coursework: provisioned infrastructure with Terraform and configured servers with Ansible.",
    categories: ["infrastructure"],
    tech: ["Terraform", "Ansible", "Linux"],
    links: [],
  },
  {
    title: "Unix Shell in C",
    year: "OSU, CS 374",
    summary: "Operating Systems coursework: a Unix shell with process creation (fork/exec), signal handling, I/O redirection and background jobs.",
    categories: ["software"],
    tech: ["C", "Linux", "POSIX"],
    links: [],
  },
  {
    title: "Client/Server Socket Programs",
    year: "OSU, CS 372",
    summary: "Computer Networks coursework: client and server programs that talk to each other over sockets.",
    categories: ["networking"],
    tech: ["Sockets", "TCP/IP"],
    links: [],
  },
  {
    title: "SQL Database Web App",
    year: "OSU, CS 340",
    summary: "Intro to Databases coursework: a web app backed by a SQL database I designed, from the entity-relationship diagram and schema to the pages that create, read, update and delete its records.",
    categories: ["software"],
    tech: ["SQL", "Relational design", "Web"],
    links: [],
  },
  {
    title: "Parallel & GPU Programming",
    year: "OSU, CS 475",
    summary: "Parallel Programming coursework: projects that split work across CPU cores and the GPU.",
    categories: ["software"],
    tech: ["Parallel programming", "GPU"],
    links: [],
  },
  {
    title: "C++ Object-Oriented Programs",
    year: "OSU",
    summary: "Games including Go Fish and Hunt the Wumpus, designed with classes, inheritance and polymorphism.",
    categories: ["software"],
    tech: ["C++", "OOP"],
    links: [],
  },
  {
    title: "Space Scene & Galaxy Map",
    year: "2026",
    summary:
      "The space behind this site: a procedural spiral galaxy, starfield and nebula drawn with WebGL, a daytime sky in light mode, and an interactive galaxy map of these projects.",
    categories: ["techart"],
    tech: ["Three.js", "WebGL", "GLSL shaders", "TypeScript"],
    links: [{ label: "Code", href: "https://github.com/ttaekratok-hub/portfolio/tree/main/site/src/space" }],
  },
  {
    title: "Reflection & Refraction Shader",
    year: "OSU, CS 457",
    summary: "Computer Graphics Shaders coursework: a GLSL shader that renders reflection and refraction in OpenGL.",
    categories: ["techart"],
    tech: ["GLSL", "OpenGL"],
    links: [],
  },
];
