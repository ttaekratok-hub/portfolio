# Portfolio

My personal portfolio site (software engineering + technical art), and a hands-on
playground for **Docker, Kubernetes and GitHub Actions CI/CD**.

```
site/                 the website (plain HTML/CSS/JS, no framework)
  index.html
  projects.js         ← edit this to add projects
  main.js             project filters + animated flow-field hero
  styles.css
tests/                Node built-in test runner checks (links, project data)
Dockerfile            nginx (non-root) image serving site/
nginx.conf            /healthz endpoint, security headers, gzip
k8s/base/             Namespace, Deployment, Service (kustomize)
k8s/overlays/pi/      production tweaks for the Raspberry Pi (Service on :57738)
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

## The pipeline

```
 PR / push ─► test ─► build ─► k8s-smoke-test ─► publish ─► deploy
             lint     docker    kind cluster      GHCR        Raspberry Pi 5
             tests    + curl    rollout + curl    amd64+arm64 (main, opt-in)
```

| Job | What it teaches |
|-----|-----------------|
| `test` | CI basics: checkout, caching, `npm ci`, failing fast |
| `build` | Docker builds, build args, layer caching, container smoke tests, artifacts between jobs |
| `k8s-smoke-test` | Spins up a throwaway Kubernetes cluster with **kind** inside the runner, deploys the same Pi overlay used in production, waits for the rollout and curls the Service. Free, no cloud account. |
| `publish` | Multi-architecture builds (QEMU + buildx): pushes an x86 + arm64 image to GitHub Container Registry, tagged with the commit SHA |
| `deploy` | Continuous deployment to k3s on a Raspberry Pi 5 through a self-hosted runner, with a GitHub Environment gate |

## Production: Raspberry Pi 5 + Cloudflare Tunnel

```
visitor ─► Cloudflare (HTTPS, WAF, bot protection)
              │  Cloudflare Tunnel (outbound from the Pi, no open ports)
              ▼
Pi 5:  cloudflared ─► localhost:57738 ─► k3s ServiceLB ─► portfolio pods (:8080)
       GitHub runner (outbound only) ─► kubectl apply ─┘
```

Run these once on the Pi.

**1. Enable memory cgroups** (needed by k3s on Raspberry Pi OS). Append to the
single line in `/boot/firmware/cmdline.txt`:

```
cgroup_memory=1 cgroup_enable=memory
```

then `sudo reboot`.

**2. Install k3s** without Traefik (Cloudflare is the front door):

```bash
curl -sfL https://get.k3s.io | sh -s - --disable traefik
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown "$USER" ~/.kube/config && chmod 600 ~/.kube/config
kubectl get nodes   # should show the Pi as Ready
```

k3s's built-in ServiceLB is what lets the Service listen on port 57738.
Make sure nothing else on the Pi (e.g. Caddy) is already using that port.

**3. Register a self-hosted GitHub Actions runner.** Repo **Settings → Actions →
Runners → New self-hosted runner → Linux / ARM64**, and run the commands it
shows. When `config.sh` asks for extra labels, enter `pi`. Then tell the runner
where the kubeconfig is and install it as a service:

```bash
echo "KUBECONFIG=$HOME/.kube/config" >> .env   # inside the runner folder
sudo ./svc.sh install && sudo ./svc.sh start
```

> **Security:** a self-hosted runner executes workflow code on your Pi. The
> `deploy` job only runs for pushes to `main`, but in a **public** repo someone
> could open a pull request that edits the workflow to target your runner.
> Either keep the repo private, or set **Settings → Actions → General → "Require
> approval for all external contributors"** and never approve a workflow run
> you haven't read.

**4. Point the tunnel at the site.** In Cloudflare **Zero Trust → Networks →
Tunnels → your tunnel → Public Hostname**, add `ttaekratok.com` and
`www.ttaekratok.com`, both with service `http://localhost:57738`. Delete any A
record that points at your home IP, and any router port-forwards for 80/443.

**5. Switch deployment on.**

1. Push to `main` once so `publish` creates the image, then on GitHub open
   **Packages → portfolio → Package settings** and set visibility to **Public**
   (or add an `imagePullSecret` to the Deployment).
2. Optional: **Settings → Environments → New environment** `production`, add
   yourself as a required reviewer to get a manual "approve deploy" button.
3. **Settings → Secrets and variables → Actions → Variables**: add
   `DEPLOY_ENABLED` = `true`.

Every push to `main` now tests, builds, publishes and rolls out to the Pi with
zero downtime (`maxUnavailable: 0`). Roll back with
`kubectl -n portfolio rollout undo deployment/portfolio`.

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
7. **GitOps.** Replace the `deploy` job with Argo CD watching the `k8s/` folder.
8. **Tech-art upgrade.** Port the flow-field hero to a WebGL fragment shader.
