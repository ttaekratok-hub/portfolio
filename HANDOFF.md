# Handoff: ttaekratok.com portfolio

Paste this into a new Claude Code session.

## Goal
The owner (aiming for a first software-engineering or technical-artist job) is
building this portfolio site and **learning GitHub Actions, Docker, Kubernetes
and CI/CD along the way**. Explain the *why* of each step.

## Where things are
- Repo `ttaekratok-hub/portfolio` (public), default branch `main`. On the Pi
  it's cloned at `~/Desktop/ttaekratok_website`.
- `site/`: React + TypeScript (Vite), pre-rendered to static HTML at build
  time (scripts/prerender.mjs) so crawlers/web filters see real content.
  Content lives in `site/src/data/` (profile.ts, projects.ts). Apple HIG design:
  system colors (tokens.css, contrast-tested), SF via system font / Inter
  fallback, Liquid Glass only on floating controls (nav, pause button).
  Space theme with Three.js (site/src/space/): background scene and a galaxy
  map of projects, loaded after hydration; daytime sky in light mode. Art section has
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
