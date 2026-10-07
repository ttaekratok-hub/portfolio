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
k8s/                  Namespace, Deployment, Service (kustomize)
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
             lint     docker    kind cluster      GHCR       real cluster
             tests    + curl    rollout + curl    (main)     (main, opt-in)
```

| Job | What it teaches |
|-----|-----------------|
| `test` | CI basics: checkout, caching, `npm ci`, failing fast |
| `build` | Docker builds, build args, layer caching, container smoke tests, artifacts between jobs |
| `k8s-smoke-test` | Spins up a throwaway Kubernetes cluster with **kind** inside the runner, deploys the manifests, waits for the rollout and curls the Service. Free, no cloud account. |
| `publish` | Pushes the *exact image that was tested* to GitHub Container Registry, tagged with the commit SHA |
| `deploy` | Continuous deployment to a real cluster with a GitHub Environment gate |

### Turning on real deployment (later)

1. Get a cluster: a cheap VPS running [k3s](https://k3s.io), or a free tier on
   a managed provider (GKE Autopilot, AKS, DigitalOcean, Oracle Cloud).
2. Repo **Settings → Environments → New environment** `production`, add a secret
   `KUBECONFIG` with your cluster's kubeconfig. Optionally add yourself as a
   required reviewer: that gives you a manual "approve deploy" button.
3. Repo **Settings → Variables** add `DEPLOY_ENABLED` = `true`.
4. Make the GHCR package public (or add an `imagePullSecret`) so the cluster can pull it.

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
