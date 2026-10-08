// Everything about you in one place. Sourced from the owner's verified
// background brief; don't add claims that aren't confirmed there.
//
// Components import these constants instead of hard-coding text, so content
// changes happen here and the layout code stays untouched. The values are
// bundled into the JavaScript and baked into the pre-rendered HTML at build
// time (all except the email, which Contact.tsx adds in the browser only), so
// a change goes live with the next deploy.

// `as const` makes every property read-only and keeps each value's exact
// literal type ("Tweety" rather than just string), so assigning to
// PROFILE.name anywhere is a compile error.
export const PROFILE = {
  name: "Tichakorn Taekratok",
  nickname: "Tweety",
  role: "Software, Cloud & Infrastructure Engineer · Technical Artist",
  intro:
    "I build and run reliable systems, from Kubernetes clusters and CI/CD pipelines to network labs, and I make art and real-time visuals.",
  about: [
    "I studied Robotics and AI at KMITL in Bangkok for a year, programming STM32 and Arduino microcontrollers, PLC ladder logic and ABB industrial robots, before starting at Oregon State University. There I graduated in Computer Science (B.S., Summa Cum Laude, 3.87 GPA) while working about 20 hours a week.",
    "Since then I’ve focused on infrastructure. I built and run my own Kubernetes platform, which serves this site and live client sites, and I build and host websites for three clients. I also work as a Business Analyst at Western Digital, turning stakeholder needs into testable requirements for engineering teams in several regions.",
    "I’m interested in cloud, DevOps and site reliability, software engineering, and network and data-center operations, and I make art and real-time visuals on the side.",
  ],
  location: "Corvallis, OR",
  relocation: "Open to relocating anywhere in the U.S.",
  workStatus: "U.S. citizen, no sponsorship needed, eligible for a security clearance (U.S. Person for ITAR purposes).",
  email: "ttaekratok@gmail.com",
  // `display` is what people read; `href` is a tel: link in international
  // format, which opens the dialer on a phone.
  phone: { display: "(541) 286-7376", href: "tel:+15412867376" },
  linkedin: "https://www.linkedin.com/in/tichakorn-taekratok-8b7b5534b",
  github: "https://github.com/ttaekratok-hub",
} as const;

// ReadonlyArray<{ ... }>: an array of objects with exactly these fields, which
// other code may read but not modify (TypeScript rejects push() or replacing an
// item; like all types, it's a compile-time check). `?` marks optional fields.
export interface Job {
  title: string;
  org: string;
  when: string;
  points: string[];
  links?: Array<{ label: string; href: string }>;
}

export const EXPERIENCE: ReadonlyArray<Job> = [
  {
    title: "Business Analyst 1, Programming",
    org: "Western Digital",
    when: "May 2026 – now",
    points: [
      "Translate stakeholder needs into implementable, testable software and system requirements for engineering teams in multiple international regions",
      "Assess the technical feasibility of proposed system changes",
      "Support software deployment workflows",
      "Audit operational data integrity and process quality against acceptance criteria",
    ],
  },
  {
    title: "Freelance Web Developer & Systems Administrator",
    org: "Part-time, about 20 hours a week",
    when: "May 2026 – now",
    points: [
      "Build and maintain production websites for three clients on Linux servers with nginx",
      "Built an admin interface for notemari.com so its non-technical owner can manage content himself",
    ],
    links: [
      { label: "cnhstudy.academy", href: "https://cnhstudy.academy" },
      { label: "reneecoco.thezerooneschool.com", href: "https://reneecoco.thezerooneschool.com" },
      { label: "notemari.com", href: "https://notemari.com" },
    ],
  },
  {
    title: "Self-directed software engineering study",
    org: "While working two jobs, about 60 hours a week",
    when: "Jun 2025 – May 2026",
    points: [
      "Team Member at both Market of Choice and Taco Bell at the same time",
      "Kept studying software engineering in my own time",
      "Built my Kubernetes platform from the ground up",
    ],
  },
];

export const EDUCATION: ReadonlyArray<{ school: string; degree: string; when: string; points: string[]; coursework: string[] }> = [
  {
    school: "Oregon State University",
    degree: "B.S. Computer Science (Applied CS option)",
    when: "Sep 2021 – Jun 2025",
    points: [
      "GPA 3.87, Summa Cum Laude",
      "Honor Roll, Fall 2021 – Winter 2025; Merit Scholarship",
      "Worked about 20 hours a week throughout",
    ],
    coursework: [
      "Data Structures",
      "Analysis of Algorithms",
      "Computer Architecture & Assembly",
      "Intro to Databases",
      "Web Development",
      "Software Engineering I & II",
      "Senior Software Engineering Project (year-long capstone)",
      "Mobile Software Development",
      "Intro to Usability Engineering",
      "Open Source Software",
      "Programming Language Fundamentals",
      "Intro to Security",
      "Computer Networks",
      "Defense Against the Dark Arts",
      "Reverse Engineering Malware",
      "Operating Systems",
      "System Administration",
      "Parallel Programming",
      "Intro to Computer Graphics",
      "Computer Graphics Shaders",
      "Computer Animation",
      "Intro to the Visual Arts",
      "New Media Futures",
      "Web Design and Programming",
      "Technical Writing",
      "Public Speaking",
    ],
  },
  {
    school: "King Mongkut’s Institute of Technology Ladkrabang (KMITL), Bangkok",
    degree: "Robotics and AI",
    when: "2020 – 2021",
    points: ["One year of study before starting at Oregon State"],
    coursework: [
      "Embedded systems",
      "Microcontrollers (STM32, Arduino)",
      "Mitsubishi PLC ladder logic",
      "ABB 6-axis industrial robots",
    ],
  },
];

export const CERTIFICATIONS: ReadonlyArray<{ name: string; org: string; status: "Completed" | "In progress" }> = [
  { name: "Solutions Architect – Associate (SAA-C03)", org: "AWS Certified", status: "In progress" },
  { name: "Pre Security (SEC0)", org: "TryHackMe", status: "Completed" },
  { name: "Cyber Security 101 (SEC1)", org: "TryHackMe", status: "In progress" },
];

// Only skills the owner has confirmed. OSPF, SNMP and MikroTik RouterOS join
// Networking once the network lab is finished.
export const SKILLS: ReadonlyArray<{ group: string; items: string[] }> = [
  { group: "Languages", items: ["Python", "C", "C++", "Bash", "SQL", "Dart / Flutter", "x86 Assembly"] },
  { group: "Cloud & DevOps", items: ["AWS (S3)", "Kubernetes (k3s)", "Docker", "GitHub Actions CI/CD", "Terraform", "Ansible", "Git (branching, pull requests, code review)"] },
  { group: "Systems", items: ["Linux (Ubuntu, Kali)", "Proxmox VE", "nginx", "Windows Server", "Active Directory"] },
  { group: "Networking", items: ["TCP/IP", "DNS", "HTTP / TLS", "Wireshark", "Nmap"] },
  { group: "Parallel & GPU", items: ["OpenMP", "SIMD", "CUDA", "OpenCL"] },
  { group: "Graphics & Art", items: ["OpenGL", "GLSL", "Blender", "Clip Studio Paint", "Procreate"] },
  { group: "Data", items: ["SQL & relational design", "Entity-relationship diagrams", "NoSQL (Firebase)"] },
  { group: "Ways of working", items: ["Requirements analysis", "Technical documentation", "Cross-region stakeholders", "Claude Code (AI-assisted development)"] },
];

// The sections in the nav bar, in page order. NavBar.tsx turns each into a
// link (href="#projects") and watches the element with that id to highlight
// the current one, so every id must match a section's id attribute in
// components/ (tests/app.test.tsx checks this).
export const SECTIONS = [
  { id: "projects", label: "Projects" },
  { id: "art", label: "Art" },
  { id: "about", label: "About" },
  { id: "skills", label: "Skills" },
  { id: "contact", label: "Contact" },
] as const;
