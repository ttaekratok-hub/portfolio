// Add or edit projects here. TypeScript checks every entry, so a typo in a
// category or a missing field fails `npm run lint` before it reaches the site.
// (lint runs `tsc`, the type checker. `npm run build` alone wouldn't catch it:
// Vite strips the types without checking them, so CI runs lint before building.)
//
// Try it: change a category below to "devop" and run `npx tsc`.
// Learn more: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html

// A union of string literals: a Category is exactly one of these four strings
// and nothing else. Unlike an enum, it adds no code at runtime, because types
// are erased. Filter is every Category plus "all", for the "show everything"
// button.
export type Category = "devops" | "networking" | "engineering" | "techart";
export type Filter = Category | "all";

// The buttons of the filter control in Projects.tsx, in order. Every filter
// needs at least one project, or it would show an empty grid
// (tests/app.test.tsx checks this).
export const FILTERS: ReadonlyArray<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "devops", label: "DevOps" },
  { id: "networking", label: "Networking" },
  { id: "engineering", label: "Engineering" },
  { id: "techart", label: "Tech Art" },
];

// An interface describes an object's shape: every project must have all of
// these fields, with these types. A link's label can only be "Code", "Docs"
// or "Live"; an empty `links` array means the card shows no links.
export interface Project {
  title: string;
  summary: string;
  categories: Category[];
  tech: string[];
  links: Array<{ label: "Code" | "Docs" | "Live"; href: string }>;
}

// Annotated as Project[] so each entry is checked right here, and an error
// points at the entry with the typo.
export const PROJECTS: Project[] = [
  {
    title: "Production Linux & Kubernetes Platform",
    summary:
      "Designed, built and operate a self-hosted k3s cluster serving live client-facing sites: deployment, troubleshooting and maintenance, CI/CD, and encrypted off-site backups with tested restores.",
    categories: ["devops"],
    tech: ["k3s", "Docker", "GitHub Actions", "AWS S3"],
    links: [],
  },
  {
    title: "MikroTik OSPF Network Lab",
    summary:
      "Two MikroTik CHR routers on Proxmox over isolated Linux bridges, with OSPF, DNS, SNMP and firewall rules, verified from a Kali client with dig, snmpwalk and traceroute.",
    categories: ["networking"],
    tech: ["RouterOS v7", "Proxmox VE", "OSPF", "Kali Linux"],
    links: [],
  },
  {
    title: "This Portfolio",
    summary:
      "React and TypeScript, pre-rendered at build time and served by nginx. Tested in CI on a throwaway Kubernetes cluster, then deployed to my k3s cluster by Flux (GitOps) in a locked-down namespace behind a Cloudflare Tunnel.",
    categories: ["devops", "engineering"],
    tech: ["React", "TypeScript", "Docker", "Kubernetes", "Flux", "GitHub Actions"],
    links: [{ label: "Code", href: "https://github.com/ttaekratok-hub/portfolio" }],
  },
  {
    title: "Flow Field Hero",
    summary:
      "The animated background at the top: particles advected through a procedural noise field on a 2D canvas, pausing when off-screen.",
    categories: ["techart"],
    tech: ["Canvas 2D", "Procedural noise", "React"],
    links: [
      {
        label: "Code",
        href: "https://github.com/ttaekratok-hub/portfolio/blob/main/site/src/components/FlowField.tsx",
      },
    ],
  },
];
