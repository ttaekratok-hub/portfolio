// Everything about you in one place. Sourced from the résumé (site/public/resume.pdf).

export const PROFILE = {
  name: "Tichakorn Taekratok",
  nickname: "Tweety",
  role: "Software & Infrastructure Engineer · Technical Artist",
  intro:
    "I build and run reliable systems, from Kubernetes clusters and CI/CD pipelines to network labs, and I make art and real-time visuals.",
  about: [
    "I’m a Computer Science graduate from Oregon State University (B.S., Summa Cum Laude, 3.87 GPA), based in Corvallis, Oregon. I work as a Business Analyst at Western Digital, turning proposed system changes into clear, testable requirements. I also host and maintain production websites for three clients, and I run my own k3s Kubernetes cluster, which serves this site.",
    "I’m looking for software engineering, infrastructure and technical art roles.",
  ],
  location: "Corvallis, OR",
  email: "ttaekratok@gmail.com",
  phone: { display: "(541) 286-7376", href: "tel:+15412867376" },
  linkedin: "https://www.linkedin.com/in/tichakorn-taekratok-8b7b5534b",
  github: "https://github.com/ttaekratok-hub",
} as const;

export const TIMELINE: ReadonlyArray<{ title: string; org: string; when: string }> = [
  { title: "Business Analyst 1, Programming", org: "Western Digital", when: "May 2026 – now" },
  { title: "Freelance Web Developer & Systems Administrator", org: "Corvallis, OR (part-time)", when: "May 2026 – now" },
  { title: "B.S. Computer Science (Applied CS)", org: "Oregon State University · Summa Cum Laude", when: "2021 – 2025" },
  { title: "Robotics and AI", org: "King Mongkut’s Institute of Technology Ladkrabang, Bangkok", when: "2020 – 2021" },
  { title: "AWS Certified Solutions Architect – Associate", org: "Amazon Web Services", when: "In progress" },
  { title: "Pre Security", org: "TryHackMe (Cyber Security 101 in progress)", when: "Completed" },
];

export const SKILLS: ReadonlyArray<{ group: string; items: string[] }> = [
  { group: "Platforms", items: ["Kubernetes (k3s)", "Docker", "nginx", "Linux (Ubuntu, Kali)", "Proxmox VE", "MikroTik RouterOS v7", "Windows Server"] },
  { group: "Automation", items: ["Python", "Bash", "Ansible", "Terraform", "Git", "GitHub Actions CI/CD"] },
  { group: "Networking", items: ["TCP/IP & subnetting", "OSPF", "DNS", "SNMP", "Firewall rules", "Routing & switching fundamentals"] },
  { group: "Troubleshooting", items: ["Wireshark", "Nmap", "traceroute & ping", "dig", "snmpwalk"] },
];

export const SECTIONS = [
  { id: "projects", label: "Projects" },
  { id: "art", label: "Art" },
  { id: "about", label: "About" },
  { id: "skills", label: "Skills" },
  { id: "contact", label: "Contact" },
] as const;
