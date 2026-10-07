// Edit this list to add your own projects. Each project needs a title,
// a one-line summary, one or more categories (devops, networking,
// engineering, techart), a tech list, and optional links.
window.PROJECTS = [
  {
    title: "Production Linux & Kubernetes Platform",
    summary: "Designed, built and operate a self-hosted k3s cluster serving live client-facing sites: deployment, troubleshooting and maintenance, CI/CD, and encrypted off-site backups with tested restores.",
    categories: ["devops"],
    tech: ["k3s", "Docker", "GitHub Actions", "AWS S3"],
    links: {}
  },
  {
    title: "MikroTik OSPF Network Lab",
    summary: "Two MikroTik CHR routers on Proxmox over isolated Linux bridges, with OSPF, DNS, SNMP and firewall rules, verified from a Kali client with dig, snmpwalk and traceroute.",
    categories: ["networking"],
    tech: ["RouterOS v7", "Proxmox VE", "OSPF", "Kali Linux"],
    links: {}
  },
  {
    title: "This Portfolio",
    summary: "A static site in an nginx container, tested in CI on a throwaway Kubernetes cluster, then deployed to my k3s cluster by Flux (GitOps) in a locked-down namespace behind a Cloudflare Tunnel.",
    categories: ["devops", "engineering"],
    tech: ["Docker", "Kubernetes", "Flux", "GitHub Actions", "Cloudflare Tunnel"],
    links: { code: "https://github.com/ttaekratok-hub/portfolio" }
  },
  {
    title: "Flow Field Hero",
    summary: "The animated background above: particles advected through a procedural noise field on a 2D canvas.",
    categories: ["techart"],
    tech: ["Canvas 2D", "Procedural noise"],
    links: { code: "https://github.com/ttaekratok-hub/portfolio/blob/main/site/main.js" }
  }
];
