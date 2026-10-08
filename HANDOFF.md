# Handoff: ttaekratok.com portfolio

Paste this into a new Claude Code session.

## Goal
The owner (aiming for a first software-engineering or technical-artist job) is
building this portfolio site and **learning GitHub Actions, Docker, Kubernetes
and CI/CD along the way**. Explain the *why* of each step.

## Where development happens (since 2026-10-08)
**Develop in Claude Code on the web (cloud sessions), never on the Pi 5.**
On 2026-10-07/08 testing the three.js site on the Pi launched hundreds of
headless Chromium instances that were never closed; their /tmp profiles
(a RAM disk) plus software-GPU rendering filled 16 GB RAM and swap, took
down the Cloudflare tunnels and broke the owner's other services.

- Cloud session: clone, `npm ci`, lint/test/build, screenshots with the
  pre-installed Chromium/Playwright are all fine there. Still close every
  browser you open (try/finally) and stop dev servers before finishing.
- Ship changes as a branch + PR into `main`. Merging to `main` is the
  deploy: CI builds and publishes the image, moves the `deploy` branch, and
  Flux on the Pi pulls it within a minute. Nobody copies files to the Pi.
- The Pi 5 only hosts: k3s + Flux + the Cloudflare tunnel. No `npm`, no
  dev servers, no builds, no headless browsers there. If something on the
  Pi needs checking, give the owner read-only commands to run (see README
  "Day to day") instead.

## Space theme: verified and merged (2026-10-08)
`space-theme`, `space-bg` and `space-map` are merged together on
`claude/ecstatic-euler-5phb35`. The two unverified WIP commits were
reviewed and kept, with fixes: two leftover debug globals removed (they kept
disposed scenes alive), the map redraws immediately on resize (no flicker),
and the territory shader holds every claim (MAX_CLAIMS 88). An older phone
bug was fixed too: About cards and their links pushed the page to 600px wide
on a 390px phone. Lint, 79 tests, build and HTML validation pass; checked in
headless Chromium at desktop and phone widths and with Reduce Motion, with no
console errors. Merged as PR #7.

## Where things are
- Repo `ttaekratok-hub/portfolio`, default branch `main`. GitHub is the only
  copy: the Pi has no clone, and its write deploy key was removed (2026-10-08).
- `site/`: React + TypeScript (Vite), pre-rendered to static HTML at build
  time (scripts/prerender.mjs) so crawlers/web filters see real content.
  Content lives in `site/src/data/` (profile.ts, projects.ts).
  The résumé PDF (`site/public/resume.pdf`) is printed from `resume/resume.html`
  with `npm run resume` (one page enforced); commit both after editing. Apple HIG design:
  system colors (tokens.css, contrast-tested), SF via system font / Inter
  fallback, Liquid Glass only on floating controls (nav, pause button).
  Space theme with Three.js (site/src/space/): background scene and a galaxy
  map of projects, loaded after hydration. The site is always dark (2026-10-08:
  light mode and the daytime sky were removed). Art section has
  two "under construction" placeholders; the MikroTik-Lab GitHub repo is empty,
  so it isn't linked yet.
- Pipeline (`.github/workflows/ci-cd.yml`): test → build → k8s-smoke-test
  (kind, same tenant + limited account as the Pi) → publish (GHCR, public
  package, amd64+arm64) → deploy (CI rewrites the `deploy` branch with `k8s/`
  only, image pinned to the tested SHA).
- Production: k3s on a Raspberry Pi 5, shared with other apps. Flux pulls
  `deploy` and applies `k8s/overlays/pi` as `portfolio-reconciler`, sandboxed
  by `k8s/tenant/` (Role, restricted Pod Security, NetworkPolicy, Service
  admission policy, quota). One-time setup: `kubectl apply -k k8s/flux`.
- Traffic: Cloudflare → dashboard-managed Cloudflare Tunnel → NodePort 30738
  on the Pi's LAN IP. README has the details and the learning exercises.

## Local checks
`npm ci && npm run lint && npm test && npm run build && npm run validate:html`

## Safety notes to keep giving the owner
- Never paste tunnel tokens, kubeconfigs or IPs into chat. Avoid plain
  `docker inspect` (it prints tunnel tokens); use `-f` with specific fields.
- Never re-run the k3s installer on the Pi: the cluster also runs other apps.
- Keep the site CSP-safe: no inline <script>/<style>/style="" in rendered
  HTML (tests/prerender.test.ts guards this).
- Keep the tenant guardrails when adding Kubernetes objects: widen the Role
  in `k8s/tenant/rbac.yaml` only for the exact kinds needed, never use a
  built-in role like `edit`.
