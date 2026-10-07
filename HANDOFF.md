# Handoff: ttaekratok.com portfolio

Paste this into a new Claude Code session.

## Goal
The owner (aiming for a first software-engineering or technical-artist job) is
building this portfolio site and **learning GitHub Actions, Docker, Kubernetes
and CI/CD along the way**. Explain the *why* of each step.

## Where things are
- Repo `ttaekratok-hub/portfolio` (public), default branch `main`. On the Pi
  it's cloned at `~/Desktop/ttaekratok_website`.
- `site/`: the static site. Still to personalize: "Your Name", About text,
  contact links, `site/resume.pdf`, real projects in `site/projects.js`.
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
`npm ci && npm run lint && npm test`

## Safety notes to keep giving the owner
- Never paste tunnel tokens, kubeconfigs or IPs into chat. Avoid plain
  `docker inspect` (it prints tunnel tokens); use `-f` with specific fields.
- Never re-run the k3s installer on the Pi: the cluster also runs other apps.
- Keep the tenant guardrails when adding Kubernetes objects: widen the Role
  in `k8s/tenant/rbac.yaml` only for the exact kinds needed, never use a
  built-in role like `edit`.
