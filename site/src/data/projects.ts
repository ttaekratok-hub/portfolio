// Add or edit projects here. TypeScript checks every entry, so a typo in a
// category or a missing field fails `npm run lint` before it reaches the site.

export type Category = "devops" | "networking" | "engineering" | "techart";
export type Filter = Category | "all";

export const FILTERS: ReadonlyArray<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "devops", label: "DevOps" },
  { id: "networking", label: "Networking" },
  { id: "engineering", label: "Engineering" },
  { id: "techart", label: "Tech Art" },
];

export interface Project {
  title: string;
  summary: string;
  categories: Category[];
  tech: string[];
  links: Array<{ label: "Code" | "Docs" | "Live"; href: string }>;
}

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
