# Handoff: ttaekratok.com portfolio (as of 2026-10-07)

Paste this into the new Claude Code session.

## Goal
The user (aiming for a first software-engineering or technical-artist job) is
building a portfolio site and **learning GitHub Actions, Docker, Kubernetes and
CI/CD along the way**. Explain the *why* of each step; they're learning.

## Repo: `ttaekratok-hub/portfolio` (default branch `main`)
- `site/`: static portfolio (HTML/CSS/JS). Edit `site/projects.js` to add projects.
  Animated canvas flow-field hero. Placeholders still to fill: "Your Name",
  About text, contact links, `site/resume.pdf` (the Résumé button 404s until it exists).
- `Dockerfile` + `nginx.conf`: nginx-unprivileged (UID 101), port 8080,
  `/healthz`, security headers, `version.json` holding the build's commit SHA.
- `k8s/base/`: Namespace, Deployment (2 replicas, probes, non-root), Service (ClusterIP :80).
- `k8s/overlays/pi/`: JSON patch makes the Service `LoadBalancer` on **port 57738**
  (k3s ServiceLB; NodePorts can't use 57738). Use a JSON patch, not a
  strategic merge: a strategic merge adds a duplicate port.
- `.github/workflows/ci-cd.yml`: test → build (+ container smoke test) →
  k8s-smoke-test (kind cluster in CI, deploys the Pi overlay) → publish
  (multi-arch amd64+arm64 to `ghcr.io/ttaekratok-hub/portfolio:<sha>` and `:latest`, main only)
  → deploy (self-hosted runner `[self-hosted, linux, ARM64, pi]`, main pushes only,
  gated on repo variable `DEPLOY_ENABLED == 'true'`, environment `production`).
- `.github/actionlint.yaml` declares the custom `pi` runner label.
- README has the Pi setup guide and 8 learning exercises.

## Status
- PR ttaekratok-hub/portfolio#1 merged. All CI green on `main`, including the
  kind Kubernetes test and publish. Deploy skipped (`DEPLOY_ENABLED` not set yet).
- Local checks: `npm ci && npm run lint && npm test`.
- The cloud sandbox can't run kind/k3s (no cgroups); rely on CI for cluster tests.
- The old working branch `claude/admiring-darwin-nmetn2` is merged; start new work
  from `main`.

## Hosting setup (user's Raspberry Pi 5, user `admin`, host `pi5`)
- Domain **ttaekratok.com** to be served via an existing **Cloudflare Tunnel**
  (no A record, no port forwarding). Bot protection via Cloudflare.
- The Pi already runs Caddy and other sites. Make sure nothing else uses port 57738.
- The Pi runs **3 cloudflared processes inside Docker containers** (UID 65532 =
  official cloudflared image):
  - 2 file-managed: `tunnel --no-autoupdate --config /etc/cloudflared/config.yml run`
    (path is *inside* the container, mounted from somewhere on the host)
  - 1 dashboard/token-managed: `tunnel --no-autoupdate run` (token from env var)
- Tunnels the user named: **Main_Tunnel** (serves nokweed.com) and a
  **coosmedford** tunnel. Plan: add ttaekratok.com + www to **Main_Tunnel**.
- `/etc/cloudflared` on the host is a stray **empty 0-byte file** created by
  accident today; safe to `sudo rm /etc/cloudflared`. `~/.cloudflared` only has
  `cloudflared access` login files.

## Next steps
1. **Identify Main_Tunnel's container and its network mode.** Ask the user to run:
   ```bash
   docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}' | grep -i cloudflared
   docker ps -q | xargs docker inspect -f '{{.Name}}  net={{.HostConfig.NetworkMode}}  {{range .Mounts}}{{.Source}}->{{.Destination}} {{end}}' | grep -i -e cloudflared -e tunnel
   ```
   Then `cat <mounted host dir>/config.yml` to find the one routing nokweed.com.
   If neither file-managed config has it, Main_Tunnel is the token-managed one:
   add routes in Zero Trust → Networks → Tunnels → Main_Tunnel → Public Hostname.
2. **Choose the service URL by network mode** (important gotcha):
   `net=host` → `http://localhost:57738`; bridge/compose network →
   `http://172.17.0.1:57738` or the Pi's LAN IP (`hostname -I`). Mirror however
   nokweed.com's existing rule reaches its origin.
3. Add `ttaekratok.com` and `www.ttaekratok.com` rules **above** the
   `http_status:404` catch-all (if file-managed), `cloudflared tunnel ingress validate`,
   route DNS, `docker restart <container>`. Confirm nokweed.com still works.
4. Test the tunnel before k3s exists: `python3 -m http.server 57738 -d /tmp/hello`
   on the Pi, open https://ttaekratok.com on mobile data, then stop it.
5. Pi setup per README: memory cgroups in `/boot/firmware/cmdline.txt` → reboot;
   `curl -sfL https://get.k3s.io | sh -s - --disable traefik`; copy kubeconfig to
   `~/.kube/config`; register self-hosted runner with label `pi`, add
   `KUBECONFIG=...` to the runner's `.env`, install as a service.
6. Make the GHCR package public (or add an imagePullSecret), set repo variable
   `DEPLOY_ENABLED=true`, push to main, then verify the site loads.
7. Then: personalize site content; learning exercises in README.

## Safety notes to keep giving the user
- Never paste tunnel tokens, kubeconfigs or IPs into chat. Avoid plain `docker inspect`
  (it prints `TUNNEL_TOKEN`); use the `-f` formats above.
- Self-hosted runner + public repo: make the repo private or enable "Require approval
  for all external contributors" (fork PRs could otherwise run code on the Pi).
