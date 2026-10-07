# Portfolio

My personal portfolio site (software engineering + technical art), and a hands-on
playground for **Docker, Kubernetes and GitHub Actions CI/CD**.

```
site/                 the website (plain HTML/CSS/JS, no framework)
  index.html
  projects.js         ← edit this to add projects
  main.js             project filters + animated flow-field hero
  styles.css
tests/                Node built-in test runner checks (links, project data, k8s manifests)
Dockerfile            nginx (non-root) image serving site/
nginx.conf            /healthz endpoint, security headers, gzip
k8s/base/             Deployment, Service (kustomize)
k8s/overlays/pi/      production on the Raspberry Pi (NodePort 30738)
k8s/tenant/           the site's sandbox on the shared cluster: namespace, quota, Flux's limited account, guardrails
k8s/flux/             one-time Pi setup: the tenant + the Flux config that deploys the `deploy` branch
.github/workflows/    the CI/CD pipeline
```

## Run it locally

```bash
npm install
npm run lint          # HTML validation
npm test              # unit tests
npm start             # http://localhost:3000

# or the real production container:
docker build -t portfolio .
docker run --rm -p 8080:8080 portfolio   # http://localhost:8080
```

On the Pi this repo lives at `~/Desktop/ttaekratok_website`.

## The pipeline

```
 PR / push ─► test ─► build ─► k8s-smoke-test ─► publish ─► deploy ············► Flux (on the Pi)
             lint     docker    kind cluster      GHCR        moves the `deploy`   pulls `deploy`,
             tests    + curl    rollout + curl    amd64+arm64 branch               rolls it out
                                                  └─ pushes to main only ─┘
```

Pull requests stop after `k8s-smoke-test`; only pushes to `main` publish and deploy.

| Job | What it teaches |
|-----|-----------------|
| `test` | CI basics: checkout, caching, `npm ci`, failing fast |
| `build` | Docker builds, build args, layer caching, container smoke tests, artifacts between jobs |
| `k8s-smoke-test` | Spins up a throwaway Kubernetes cluster with **kind** inside the runner, deploys the same Pi overlay used in production, waits for the rollout and curls the Service. Free, no cloud account. |
| `publish` | Multi-architecture builds (QEMU + buildx): pushes an x86 + arm64 image to GitHub Container Registry, tagged with the commit SHA |
| `deploy` | GitOps: points the `deploy` branch at the tested commit plus a commit pinning its image. Per-job least-privilege `permissions`, a `concurrency` lock, and a GitHub Environment record of every deploy |

## Production: Raspberry Pi 5 + Flux + Cloudflare Tunnel

```
visitor ─► Cloudflare (HTTPS, WAF, bot protection)
              │  Cloudflare Tunnel (outbound from the Pi, no open ports)
              ▼
Pi 5:  cloudflared (Docker) ─► <pi-lan-ip>:30738 (NodePort) ─► portfolio pods (:8080)
                                                    ▲
       Flux (inside k3s) ── pulls the `deploy` ─────┘ applies k8s/overlays/pi
                            branch every minute
```

### How a change goes live

1. You push to `main` (or merge a PR).
2. CI tests, builds, deploys to a throwaway kind cluster, then publishes
   `ghcr.io/ttaekratok-hub/portfolio:<commit-sha>`.
3. The `deploy` job replaces the `deploy` branch with a single commit that holds
   just `k8s/` from that commit, with `<commit-sha>` pinned as the image.
   Nothing else writes to `deploy`, and it never contains workflow files.
4. Flux checks `deploy` every minute, applies the overlay and waits for the
   rolling update (`maxUnavailable: 0`, so no downtime).

If any job fails, `deploy` doesn't move and the Pi keeps serving the last good
version. That includes changes to `k8s/`: the kind cluster applies them under
the same sandbox and with the same limited account as Flux on the Pi, so
anything the Pi would reject fails the pipeline first.

### Who can change what runs on the Pi (the trust boundary)

Pull-based deploys mean nothing on the internet connects into the Pi, and no CI
script runs there. But Flux applies whatever is on `deploy`, so anyone who can
push to this repo can change what the site runs. That's you, CI's token, and the
Pi's `pi5-desktop` deploy key. The tenant (`k8s/tenant/`, owned by the cluster
admin, not by Flux) keeps that from spreading to the mail server and other apps
on the same Pi:

| Guardrail | What it stops |
|-----------|---------------|
| Flux applies as **`portfolio-reconciler`**, whose Role allows only the site's Deployment and Service (`rbac.yaml`) | touching other namespaces, Secrets, RBAC, or Flux objects. Built-in roles like `edit` would allow creating Flux objects, which Flux then runs as cluster-admin. |
| **Restricted** Pod Security on the namespace | root, privileged and host-disk pods |
| **NetworkPolicy**: inbound on 8080 only, no outbound at all (`guardrails.yaml`) | a bad image talking to the mail server or anything else on the network |
| **Admission policy** on Services | `externalIPs`, LoadBalancer/ExternalName or Tailscale tricks that would capture other traffic |
| **ResourceQuota** | starving the Pi's memory or disk |

What's left: a bad commit can still break or deface the site itself. That's
what review and CI are for.

### Day to day

```bash
kubectl -n flux-system get gitrepository,kustomization portfolio   # is Flux happy?
kubectl -n portfolio get pods
curl -s https://ttaekratok.com/version.json                         # which commit is live
git log -1 origin/deploy                                            # what CI deployed last

# deploy now instead of waiting up to a minute
kubectl -n flux-system annotate gitrepository portfolio \
  reconcile.fluxcd.io/requestedAt="$(date +%s)" --overwrite
```

**Roll back:** `git revert <bad commit>` on `main` and push. It goes through the
whole pipeline like any change, and it always works. For a faster rollback to a
run from the **last 30 days** (GitHub's re-run limit): in **Actions**, open the
last good run on `main`, find **deploy** in the **Jobs** list on the left, click
its re-run icon, then **Re-run jobs**. That puts that run's manifests and image
back on `deploy`. The next push to `main` deploys again, so revert or fix the
bad commit too. `kubectl rollout undo` won't stick: Flux re-applies git within
10 minutes.

**Pause and resume deploys** while you investigate:

```bash
kubectl -n flux-system patch kustomization portfolio --type=merge -p '{"spec":{"suspend":true}}'
kubectl -n flux-system patch kustomization portfolio --type=merge -p '{"spec":{"suspend":false}}'
kubectl -n flux-system get kustomization portfolio -o jsonpath='{.spec.suspend}'   # paused?
```

### One-time setup (already done on pi5)

The cluster is k3s with Traefik and ServiceLB disabled and Flux installed,
which is why the Service is a NodePort rather than a LoadBalancer.

**1. Read-only deploy key for Flux.** The private key goes straight into a
Kubernetes Secret and is deleted from disk:

```bash
ssh-keygen -t ed25519 -N "" -C flux-pi5 -f flux_id
ssh-keyscan github.com > known_hosts
kubectl -n flux-system create secret generic portfolio-git \
  --from-file=identity=flux_id --from-file=identity.pub=flux_id.pub --from-file=known_hosts
shred -u flux_id
```

Add `flux_id.pub` under **Settings → Deploy keys** with write access **off**.

**2. Public image.** Packages have their own visibility, separate from the
repo's. Open **Packages → portfolio → Package settings** and set it to
**Public**, so the cluster can pull without credentials.

**3. Cluster setup**, once CI has created the `deploy` branch
(`git ls-remote origin deploy` shows it): `kubectl apply -k k8s/flux` creates
the tenant and the Flux config, then run the "deploy now" command above. Flux
doesn't manage `k8s/tenant/` or `k8s/flux/` itself, so re-run the apply after
editing them.

**4. Point the tunnel at the NodePort.** This tunnel is managed from the
dashboard, so a local `config.yml` is ignored. In **Zero Trust → Networks →
Tunnels → (tunnel) → Published application routes**, add `ttaekratok.com` and
`www.ttaekratok.com`, type **HTTP**, URL `<pi-lan-ip>:30738`. The dashboard
creates the DNS records itself, so first delete any existing A/AAAA/CNAME
records for those names, and any router port-forwards for 80/443.

Why not `localhost`? cloudflared runs in a Docker container on a bridge
network, where `localhost` is the container itself. Give the Pi a DHCP
reservation on the router so its LAN IP never changes.

> **Branch protection:** protecting `main` (exercise 2) is safe; CI never
> pushes to it. Don't protect `deploy`: CI force-pushes it on every deploy and
> its commits never get status checks, so either rule would block deploys.

## Make it yours: checklist

- [ ] Replace "Your Name", the about text and contact links in `site/index.html`
- [ ] Add `site/resume.pdf`
- [ ] Put 3–5 real projects in `site/projects.js`, each with a problem, what you did, and a result
- [ ] Tech art: add screenshots/GIFs/turntables of shaders, tools, rigs (keep files small, use `.webp`/`.mp4`)

## Learning exercises (do them one PR at a time)

1. **Break the build on purpose.** Add a broken link in `index.html`, open a PR, watch `test` fail. Fix it.
2. **Branch protection.** Settings → Branches: require the `test`, `build` and `k8s-smoke-test` checks before merging to `main`.
3. **Add an Ingress.** Install ingress-nginx in the kind job and route a hostname to the Service.
4. **Autoscaling.** Add a `HorizontalPodAutoscaler` for the Deployment.
5. **Security scanning.** Add a Trivy image scan step to `build` and fail on critical CVEs.
6. **Preview environments.** Deploy each PR to its own namespace (`pr-123`) and comment the URL.
7. **Image automation.** Replace the `deploy` job with Flux's image-reflector and image-automation controllers, so the Pi notices new images by itself.
8. **Tech-art upgrade.** Port the flow-field hero to a WebGL fragment shader.
9. **Deploy status on commits.** Add a Flux `Provider` (type `github`) and `Alert` so each commit on GitHub shows whether it reached the Pi.
