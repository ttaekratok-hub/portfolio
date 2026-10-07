# Portfolio

My personal portfolio site (software engineering + technical art), and a hands-on
playground for **React, TypeScript, Docker, Kubernetes and GitHub Actions CI/CD**.

This README doubles as a learning guide. New here? Start with
[The big picture](#the-big-picture), follow [a request](#follow-a-request) and
[a commit](#follow-a-commit) through the system, then use
[A learning path](#a-learning-path) to read the code in a sensible order.
[Concepts in this repo](#concepts-in-this-repo) maps each idea to the file where
you can see it. Most source and config files open with a comment in the same
spirit: what the file does, how it connects to the rest, and how to try it.

## The big picture

```
CODE: a commit goes live                REQUEST: someone opens the site

git push to main                        browser: https://ttaekratok.com
    │                                       │
    ▼                                       ▼
GitHub Actions (CI)                     Cloudflare
lint, tests, build, smoke tests         HTTPS, WAF, bot protection
    │                                       │
    ├──► GHCR (image registry)              ▼
    │    portfolio:<commit-sha>         Cloudflare Tunnel
    ▼                                   opened outbound by the Pi
deploy branch                               │
k8s/ with the image pinned                  ▼
    │                                   cloudflared (Docker, on the Pi)
    │ fetched every minute                  │
    ▼                                       ▼
Flux (runs inside k3s)                  NodePort 30738 on the Pi's LAN IP
applies k8s/overlays/pi                     │
    │                                       │
    ▼                                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│ k3s on the Raspberry Pi 5, namespace portfolio                         │
│ Deployment ──► 2 pods, each nginx on port 8080 serving the built site  │
│ (k3s pulls the image from GHCR when it starts new pods)                │
└────────────────────────────────────────────────────────────────────────┘
```

Two paths meet at the same two pods. On the **code** path, GitHub Actions tests
every change, publishes it as a container image to GHCR, then moves the `deploy`
branch. Flux, an agent running inside the Pi's Kubernetes cluster (k3s), pulls
that branch and applies it; the Deployment then replaces its pods, and k3s
fetches the new image. This
is **GitOps**: git says what should run, and the cluster makes it so. On the
**request** path, Cloudflare handles HTTPS and filtering, then forwards each
request down a tunnel that the Pi itself opened. On both paths the Pi only makes
outbound connections (to GitHub, GHCR and Cloudflare), so CI never holds a key
to the Pi and the router forwards no ports for this site. The rest of this
README zooms in on each step.

## What's where

```
site/                 the website: React + TypeScript, built with Vite
  index.html          page shell: <head> tags; the app is rendered into #root
  src/main.tsx        starts React in the browser; entry-server.tsx renders it at build time
  src/App.tsx         the whole page, section by section
  src/data/           ← edit profile.ts and projects.ts to change the content
  src/components/     one file per section (Hero, Projects, Art, About, Contact…)
  src/space/          the Three.js space theme: shared engine, galaxy generator,
                      background scene, galaxy map of projects
  src/styles/         tokens.css (Apple colors/type), glass.css (Liquid Glass), global.css
  public/             copied as-is: resume.pdf, icons, security.txt, robots.txt
scripts/prerender.mjs renders the React app to HTML at build time
tests/                Vitest: page behavior, pre-rendered HTML, color contrast, k8s manifests
package.json          the npm scripts (dev, lint, test, build) and dependencies
vite.config.ts        how Vite builds site/ into dist/ (tests use vitest.config.ts)
tsconfig.json         TypeScript settings: it only type-checks; Vite does the compiling
eslint.config.js      lint rules: JavaScript, TypeScript, React hooks, accessibility
Dockerfile            Node build stage → nginx (non-root) image serving dist/
.dockerignore         files kept out of the Docker build
nginx.conf            /healthz endpoint, security headers, asset caching, gzip
k8s/base/             Deployment, Service (kustomize)
k8s/overlays/pi/      production on the Raspberry Pi (NodePort 30738)
k8s/tenant/           the site's sandbox on the shared cluster: namespace, quota, Flux's limited account, guardrails
k8s/flux/             one-time Pi setup: the tenant + the Flux config that deploys the `deploy` branch
.github/workflows/    the CI/CD pipeline
```

`dist/` (the build output) and `node_modules/` are generated, so git ignores them.

## Run it locally

```bash
npm install           # install the dependencies into node_modules/
npm run dev           # http://localhost:5173, reloads as you edit
npm run lint          # ESLint (incl. accessibility rules) + TypeScript type check
npm test              # Vitest, once (npx vitest keeps running and re-runs on save)
npm run build         # production build into dist/ (pre-rendered)
npm run validate:html # check that dist/index.html is valid HTML (after a build)
npm run preview       # serve dist/ at http://localhost:4173

# or the real production container:
docker build -t portfolio .
docker run --rm -p 8080:8080 portfolio   # http://localhost:8080
curl -sI http://localhost:8080/          # in another terminal: the headers nginx.conf adds
```

On the Pi this repo lives at `~/Desktop/ttaekratok_website`.

CI's `test` job runs the same scripts: `npm ci`, `npm run lint`, `npm test`,
`npm run build` and `npm run validate:html`. Running them before you push
catches most failures before CI does. (`npm ci` installs exactly what
`package-lock.json` lists and fails if it disagrees with `package.json`, so
every build gets the same versions; `npm install` is for adding or updating
packages.)

## How the site works

**Pre-rendering.** A plain React app ships an empty `<div>` and builds the page
with JavaScript in the browser. Crawlers and corporate web filters often don't
run JavaScript, so they'd see a blank page. Instead, `npm run build` renders the
React app to HTML once at build time; the browser shows that HTML immediately,
then React *hydrates* it (attaches the event handlers) without redrawing.
Rendering React outside a browser is called server-side rendering (SSR); doing
it once per build, instead of on every request, is pre-rendering. The build
script in `package.json` has three steps:

1. `vite build`: the browser build, `dist/index.html` plus bundled, hashed
   files in `dist/assets/`.
2. `vite build --ssr src/entry-server.tsx ...`: the same components compiled
   for Node.js.
3. `node scripts/prerender.mjs`: runs that once and writes the HTML into
   `dist/index.html`.

So production needs no Node.js server: nginx serves `dist/` as plain files.
`tests/prerender.test.ts` checks the HTML has the real content and nothing the
Content-Security-Policy would block. (The CSP is a header from `nginx.conf` that
tells the browser to load scripts and styles only from this site, and never to
run inline ones.)

**Design.** Following Apple's Human Interface Guidelines (HIG):

- *Colors:* Apple's system colors for light and dark mode, kept as design
  tokens, named CSS variables like `--label`, in `site/src/styles/tokens.css`.
  Where an Apple value is too faint for small text on the web, the "Increase
  Contrast" variant or apple.com's own value is used; `tests/tokens.test.ts`
  computes every text/background contrast ratio and fails below 4.5:1, the WCAG
  AA minimum for normal-size text.
- *Type:* the HIG iOS text styles. Apple devices render real SF Pro through the
  system font; Apple's license doesn't allow serving SF as a web font, so other
  devices get Inter, its closest open-source match.
- *Liquid Glass* (`site/src/styles/glass.css`) only on the floating controls
  that stay above the content as it scrolls (the nav and the animation's
  pause button), as the HIG asks. The
  project filter and the résumé button scroll with the page, so they use iOS's
  standard gray fills instead (glass there would stack under the glass nav). It's
  built on `backdrop-filter`, a CSS effect applied to whatever is behind an
  element: real refraction where the browser supports it (Chromium: Chrome,
  Edge), frosted blur elsewhere, and a solid surface for Reduce Transparency /
  Increase Contrast.
- Capsule controls with 44pt tap targets, inset grouped lists like iOS
  Settings, continuous ("squircle") corners where the browser supports them,
  and light/dark following the system setting.

**Space theme (Three.js / WebGL).** Behind the page: a starfield, a procedural
spiral galaxy and nebula clouds in dark mode, a soft daytime sky with clouds in
light mode (`site/src/space/background.ts`). In the Projects section: an
interactive galaxy map where every project is a star system and every category
an "empire", inspired by the Stellaris galaxy map (`site/src/space/map.ts`,
`site/src/components/GalaxyMap.tsx`). How it stays fast and accessible:

- *Loaded late:* the page is pre-rendered without any 3D; a CSS gradient
  stands in. After hydration, when the browser is idle, the scenes and Three.js
  arrive through a dynamic `import()`, a separate file, so the main bundle stays
  small (`tests/space.test.ts` checks that Three.js isn't in it).
- *One engine for both scenes* (`site/src/space/engine.ts`): capped pixel ratio,
  frames only while something moves, paused off-screen and in background tabs,
  resizing, recovery from a lost GPU context, and full cleanup.
- *Deterministic:* stars come from a seeded random generator
  (`site/src/space/random.ts`), so the galaxy is the same on every visit and the
  generator is unit-tested (`site/src/space/galaxy.ts`).
- *Visitor settings:* Reduce Motion gets still frames; a floating pause button
  stops the animation (WCAG 2.2.2); light/dark switches live; without WebGL the
  CSS gradient stays and the map says so. The map's star systems are real
  buttons, so it works with a keyboard and a screen reader, and every project is
  also listed as a card below it.

## Follow a request

What happens, hop by hop, when someone opens https://ttaekratok.com:

1. **DNS.** The browser asks DNS for the address of `ttaekratok.com` and gets
   Cloudflare's addresses, not the Pi's home IP: the tunnel's route created
   those DNS records (step 4 of the one-time setup below).
   Try it: `getent hosts ttaekratok.com`
2. **Cloudflare.** The browser connects to a nearby Cloudflare server over
   HTTPS. Cloudflare holds the site's certificate and decrypts the request
   (HTTPS ends here), checks it with its web application firewall (WAF) and bot
   protection, and looks up which tunnel serves this hostname.
3. **Cloudflare Tunnel.** When `cloudflared` started on the Pi, it opened
   long-lived, encrypted connections *out* to Cloudflare. Cloudflare sends the
   request back down one of them, so nothing on the internet connects in.
4. **cloudflared → NodePort.** `cloudflared`, running in Docker on the Pi,
   makes a plain HTTP request to `<pi-lan-ip>:30738`, the route set in the
   Cloudflare dashboard. (Not `localhost`: inside the container, that's the
   container itself.)
5. **NodePort → a pod.** Port 30738 belongs to the `portfolio` Service
   (`k8s/overlays/pi/service-patch.yaml`). Kubernetes' Service networking
   (kube-proxy, built into k3s) forwards the connection to port 8080 of one of
   the pods whose readiness probe passes. The NetworkPolicy in
   `k8s/tenant/guardrails.yaml` lets traffic in on that port only.
6. **nginx.** `nginx.conf` serves `/` from `index.html`, the pre-rendered page,
   so no code runs to build the response: nginx reads a file. It adds the
   security headers (HSTS, CSP and more) and compresses the response with gzip
   when the client accepts it.
   Try it, with the local container running: `curl -sI http://localhost:8080/`
7. **Back the same way.** The response returns through the tunnel, and
   Cloudflare encrypts it for the browser.
   Try it: `curl -sI https://ttaekratok.com/` shows nginx's headers next to
   Cloudflare's own (`server: cloudflare`, `cf-ray`).
8. **The browser renders.** The HTML already holds the content, so the page
   appears as soon as the stylesheet has loaded, without waiting for
   JavaScript. The browser fetches the stylesheet, the script and any font
   files it needs from `/assets/` (cached for a year, see `nginx.conf`) and
   checks every load against the CSP. The script is a module
   (`<script type="module">`), which the browser runs only after it has read
   the whole HTML.
9. **React hydrates.** `site/src/main.tsx` calls `hydrateRoot`: React matches
   its components to the HTML already on the page and attaches event handlers.
   Then browser-only code runs. Effects make the nav highlight the section on
   screen, start the hero animation (one still frame with Reduce Motion),
   switch on glass refraction in Chromium (unless Reduce Transparency is on)
   and fetch `/version.json` so the footer shows which commit is live. And
   `Contact.tsx` renders once more, now with the email link.

## The pipeline

CI (continuous integration) checks every change automatically; CD (continuous
delivery/deployment) ships the changes that pass. Here both are one GitHub
Actions workflow, `.github/workflows/ci-cd.yml`, with five jobs. Each job runs
on a fresh GitHub-hosted machine (a runner) and starts only if the job before
it passed.

```
 PR / push ─► test ─► build ─► k8s-smoke-test ─► publish ─► deploy ············► Flux (on the Pi)
             lint     docker    kind cluster      GHCR        moves the `deploy`   pulls `deploy`,
             tests    + curl    rollout + curl    amd64+arm64 branch               rolls it out
                                                  └─ pushes to main only ─┘
```

Pull requests stop after `k8s-smoke-test`; only pushes to `main` publish and deploy.

| Job | What it teaches |
|-----|-----------------|
| `test` | CI basics: checkout, caching, `npm ci`, failing fast. Lint + typecheck, production build, tests (incl. the built page), HTML validation |
| `build` | Multi-stage Docker builds (Node build → nginx), build args, layer caching, container smoke tests, artifacts between jobs |
| `k8s-smoke-test` | Spins up a throwaway Kubernetes cluster with **kind** inside the runner, deploys the same Pi overlay used in production, waits for the rollout and curls the Service. Free, no cloud account. |
| `publish` | Multi-architecture builds (buildx): pushes an x86 + arm64 image to GitHub Container Registry, tagged with the commit SHA. The Node stage runs natively (`--platform=$BUILDPLATFORM`); only the nginx stage's one `RUN` step (writing `version.json`) runs under QEMU emulation |
| `deploy` | GitOps: replaces the `deploy` branch with one commit holding just `k8s/` from the tested commit, its image pinned to that commit. Per-job least-privilege `permissions`, a `concurrency` lock, and a GitHub Environment record of every deploy |

## Follow a commit

The same trip for a change, from `git push` to the Pi. Watch it happen in the
repo's **Actions** tab on GitHub: click a run, then a job, to see each step's log.

1. **Push.** Opening or updating a pull request, or pushing to `main`, starts
   `.github/workflows/ci-cd.yml` (its `on:` block lists the events). Merging a
   PR is a push to `main`.
2. **`test`.** A fresh runner does what you do locally: `npm ci`, lint and type
   check, tests, the pre-rendered build and HTML validation. The first failing
   step stops the run, and GitHub marks the commit as failed.
3. **`build`.** Builds the `Dockerfile` (Node stage, then nginx stage), starts
   the container and checks it with `curl`: the health check, the real
   content, `version.json`, the security headers and `security.txt`. The image
   is saved as a file and handed to the next job as an artifact.
4. **`k8s-smoke-test`.** Creates a throwaway Kubernetes cluster with kind,
   loads the image into it, applies `k8s/tenant/`, then applies the Pi overlay
   as Flux's limited account, waits for the rollout and curls the NodePort. A
   manifest the Pi would reject fails here first. Pull requests stop here.
5. **`publish`** (`main` only). Builds the image for x86 and arm64 and pushes it
   to GHCR as `ghcr.io/ttaekratok-hub/portfolio:<commit-sha>` (and `:latest`).
   Try it: `docker buildx imagetools inspect ghcr.io/ttaekratok-hub/portfolio:latest`
   lists both architectures under one tag.
6. **`deploy`** (`main` only). Appends an `images:` block to
   `k8s/overlays/pi/kustomization.yaml` that pins `<commit-sha>`, commits just
   `k8s/` as a fresh one-commit `deploy` branch and force-pushes it.
   Try it: `git fetch origin && git show --stat origin/deploy`
7. **Flux pulls.** Within a minute, Flux's GitRepository (`k8s/flux/portfolio.yaml`)
   fetches the new commit. Its Kustomization builds `k8s/overlays/pi` and
   applies it as `portfolio-reconciler`.
   Try it (on the Pi): `kubectl -n flux-system get gitrepository,kustomization portfolio`
8. **Rolling update.** The image tag in the pod template changed, so the
   Deployment creates a new ReplicaSet. One new pod starts (k3s pulls the arm64
   image from GHCR), passes its readiness probe, and only then is an old pod
   removed; then the same for the second.
   Try it (on the Pi, during a deploy): `kubectl -n portfolio get pods --watch`
   (Ctrl+C to stop)
9. **Live.** `curl -s https://ttaekratok.com/version.json` prints the new
   commit, and the page footer shows its first 7 characters ("Build 1a2b3c4.").

If any step fails, the jobs after it don't run: `deploy` doesn't move, and the
Pi keeps serving the last good version.

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

Flux *reconciles*: it keeps comparing what git says with what the cluster
runs, and changes the cluster to match. The annotation asks Flux to fetch the
`deploy` branch now instead of at the next interval; if it finds a new commit,
the Kustomization applies it right away.

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
Kubernetes Secret and is deleted from disk. `known_hosts` holds GitHub's SSH
host key, so Flux can verify it's talking to the real GitHub:

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

## Concepts in this repo

Each concept, the file where you can see it in action, and what it means in
plain words. The file's own comments go into more detail.

### The website (React + TypeScript)

| Concept | See it in | In plain words |
|---------|-----------|----------------|
| Component, JSX, props | `site/src/App.tsx`, `site/src/components/Lists.tsx` | A component is a function that returns JSX, HTML-like syntax describing part of the page. Props are its inputs, written like HTML attributes. |
| State | `site/src/components/Projects.tsx` | `useState` keeps a value between renders. Setting it makes React run the component again and update only the parts of the page that changed. |
| Effects, refs | `site/src/components/NavBar.tsx`, `site/src/components/SpaceBackground.tsx` | `useEffect` runs browser-only code after rendering (observers, animation, `fetch`); the function it returns cleans up (disconnect, cancel) when the component goes away. A ref holds a real DOM element, here the `<canvas>`. |
| Types | `site/src/data/projects.ts`, `tsconfig.json` | Union types and interfaces spell out which values are allowed, so a typo in a category fails `npm run lint` instead of reaching the site. |
| Accessibility (a11y) | `site/src/App.tsx`, `site/src/components/Projects.tsx`, `eslint.config.js` | Landmarks, a skip link and ARIA attributes let keyboard and screen-reader users find their way; lint rules catch common mistakes. |

### Rendering and styling

| Concept | See it in | In plain words |
|---------|-----------|----------------|
| Server-side rendering, pre-rendering | `site/src/entry-server.tsx`, `scripts/prerender.mjs` | Running React outside a browser to produce HTML. Done once per build here, so nginx only serves a file. |
| Hydration | `site/src/main.tsx`, `site/src/components/Contact.tsx` | React taking over HTML that's already on the page. Its first render in the browser must match that HTML exactly; `Contact.tsx` shows two ways to add something the HTML can't contain. |
| Design tokens | `site/src/styles/tokens.css` | Named CSS variables (`--label`, `--space-4`) defined once, with light and dark values, so no component hard-codes a color. |
| WCAG contrast | `tests/tokens.test.ts` | How far apart text and its background are in brightness (luminance), as a ratio from 1:1 (identical) to 21:1 (black on white). Normal-size text needs at least 4.5:1 to stay readable. |
| `backdrop-filter` | `site/src/styles/glass.css`, `site/src/components/GlassFilter.tsx` | Blurs or bends what's *behind* an element, not the element itself. The base of Liquid Glass. |
| WebGL, Three.js | `site/src/space/engine.ts`, `site/src/space/background.ts` | WebGL draws with the GPU inside a `<canvas>`; Three.js wraps it in scenes, cameras and materials. Each layer of stars is one draw call of many points. |
| Shaders | `site/src/space/` (the GLSL strings in the scenes) | Small programs that run on the GPU for every point or pixel: they place and color stars, make them twinkle and draw noise clouds. |
| Code splitting, dynamic `import()` | `site/src/components/SpaceBackground.tsx`, `tests/space.test.ts` | Loading part of the app later, as a separate file, so the first page view doesn't wait for it. |
| Progressive enhancement, user settings | `site/src/styles/global.css`, `site/src/styles/glass.css` | Newer CSS (like `corner-shape`) improves the page where supported and is ignored elsewhere. Media queries follow the visitor's Reduce Motion and Reduce Transparency settings. |

### Build, lint and test

| Concept | See it in | In plain words |
|---------|-----------|----------------|
| Bundler, dev server | `vite.config.ts` | Vite compiles TypeScript and JSX, joins the files into a few for production, and in development swaps an edited file into the open page. |
| Content hashing, caching | `vite.config.ts`, `nginx.conf` (`/assets/`) | Built files carry a hash of their content in their name, so a changed file gets a new URL, and browsers can keep the old ones for a year. |
| Type checking | `tsconfig.json` | `tsc` only checks. Vite strips the types without checking them, which is why `npm run lint` runs `tsc`. |
| Linting | `eslint.config.js` | Reading code without running it to flag likely bugs, like a hook called inside an `if` or an image without alt text. |
| Tests, jsdom | `vitest.config.ts`, `tests/app.test.tsx` | Vitest runs the tests. jsdom is a simulated browser DOM, so a test can render `<App />` and click a filter the way a visitor would. |
| Policy as code | `tests/k8s.test.ts` | The shared cluster's rules written as tests, so a manifest that breaks them fails in seconds, on any laptop. |

### Containers and the web server

| Concept | See it in | In plain words |
|---------|-----------|----------------|
| Image, container | `Dockerfile` | An image is a packaged filesystem plus a start command; a container is a running copy of it. The same image runs on a laptop, in CI and on the Pi. |
| Multi-stage build | `Dockerfile` | Build with Node.js in one stage, then copy only the finished files into a small nginx stage. Only the last stage ships. |
| Layer caching, build context | `Dockerfile`, `.dockerignore` | Docker reuses each step's result until its inputs change, so slow steps that rarely change go first. `.dockerignore` keeps files out of the build. |
| Non-root container | `Dockerfile` (`USER 101`), `k8s/base/deployment.yaml` | nginx runs as an ordinary user, so a break-in doesn't get root, and Kubernetes refuses to start the container as root. |
| Static file server | `nginx.conf` | nginx maps each URL to a file under its `root`, where the Dockerfile copied `dist/`. `location` blocks set rules per path: a health check, caching. |
| CSP, security headers | `nginx.conf`, `tests/prerender.test.ts` | Response headers that tell the browser what's allowed: HTTPS only, scripts and styles only from this site, and no site may show the page in a frame. |

### CI/CD

| Concept | See it in | In plain words |
|---------|-----------|----------------|
| Workflow, job, step, runner | `.github/workflows/ci-cd.yml` | GitHub runs the workflow for every push to `main`, every PR, and on demand (`workflow_dispatch`). Each job gets a fresh machine (a runner) and runs its steps in order. |
| `needs`, artifacts | `ci-cd.yml` (`build`, `k8s-smoke-test`) | A job starts only after the jobs it `needs` have passed. Jobs share nothing unless a file is handed over as an artifact. |
| Least privilege | `ci-cd.yml` (`permissions:`) | Each job's temporary `GITHUB_TOKEN` gets only what that job needs: `publish` may push images, `deploy` may push commits. |
| Registry, multi-arch image | `ci-cd.yml` (`publish`), `Dockerfile` (`--platform`) | GHCR stores the image. One tag holds an x86 and an arm64 build, and each machine pulls the one for its CPU. |
| Throwaway cluster | `ci-cd.yml` (`k8s-smoke-test`) | kind runs a real Kubernetes cluster inside Docker on the runner, so every deploy is rehearsed before the Pi sees it. |

### Kubernetes

| Concept | See it in | In plain words |
|---------|-----------|----------------|
| Desired state, controllers | `k8s/base/deployment.yaml` | You describe what should exist; programs in the cluster keep working to make it true, and to keep it true. |
| Deployment, ReplicaSet, Pod | `k8s/base/deployment.yaml` | A Deployment keeps 2 pods running, through one ReplicaSet per version. Each pod here is a single nginx container. |
| Rolling update | `k8s/base/deployment.yaml` (`strategy`) | Start a new pod, wait until it's Ready, then remove an old one, so a deploy causes no downtime. |
| Probes | `k8s/base/deployment.yaml`, `nginx.conf` (`/healthz`) | Kubernetes keeps asking each pod "ready for traffic?" and "still alive?", then routes around it or restarts it. |
| Requests, limits | `k8s/base/deployment.yaml` | CPU and memory set aside for a container, and the most memory it may use before it's restarted. |
| Service, NodePort | `k8s/base/service.yaml`, `k8s/overlays/pi/service-patch.yaml` | A stable address in front of pods that come and go. A NodePort also opens a fixed port (30738) on the Pi's own IP. |
| Kustomize base and overlay | `k8s/base/`, `k8s/overlays/pi/` | Shared manifests plus a per-environment layer of patches, without copying files. CI stacks one more overlay on top. |
| Namespace, quota, Pod Security | `k8s/tenant/namespace.yaml` | The site's own area of the cluster, with a cap on pods, CPU and memory, and rules that reject root or privileged pods. |
| RBAC, impersonation | `k8s/tenant/rbac.yaml`, `ci-cd.yml` (`--as=`) | Role-based access control: a Role lists allowed actions, and a RoleBinding gives it to an account. `--as` sends a request as that account, to test it. |
| NetworkPolicy | `k8s/tenant/guardrails.yaml` | A firewall for pods: here, inbound on 8080 only, and no outbound connections at all. |
| Admission policy | `k8s/tenant/guardrails.yaml` | Rules the API server checks before it accepts an object; here, which Service types and settings are allowed. |

### GitOps and the network

| Concept | See it in | In plain words |
|---------|-----------|----------------|
| GitOps, pull-based deploys | `k8s/flux/portfolio.yaml`, the `deploy` job in `ci-cd.yml` | Git holds what should run, and an agent in the cluster (Flux) pulls it. CI never needs a key to the Pi. |
| Reconcile, drift | `k8s/flux/portfolio.yaml` (`interval`) | Flux keeps comparing the cluster with git and changes the cluster to match, which also undoes manual edits ("drift"). |
| Cloudflare Tunnel | the Cloudflare dashboard (see [Production](#production-raspberry-pi-5--flux--cloudflare-tunnel)) | A connection the Pi opens out to Cloudflare, which carries visitors' requests back in, so the router forwards no ports. |
| TLS termination | [Follow a request](#follow-a-request), steps 2 to 4 | HTTPS ends at Cloudflare. The tunnel is encrypted on its own, and the last hop inside the Pi (cloudflared to nginx) is plain HTTP. |

## A learning path

The files in a sensible reading order, from the page you see to the cluster
that serves it. Each step builds on the one before.

1. **The content.** `site/src/data/profile.ts`, then `site/src/data/projects.ts`:
   TypeScript objects, union types and interfaces.
   Try it: `npm run dev`, change a sentence in `profile.ts` and watch the page
   update. Then set a project's category to `"devop"`, run `npx tsc` to see
   the type error, and undo it.
2. **Components.** `site/src/App.tsx` → `components/Hero.tsx` →
   `components/Lists.tsx` → `components/Projects.tsx`: JSX, props, state,
   rendering lists. Try it: click the project filters, then read the filter
   test at the end of `tests/app.test.tsx`.
   Learn more: https://react.dev/learn
3. **Browser-only code.** `components/NavBar.tsx`, then
   `components/SpaceBackground.tsx` and `space/engine.ts`: effects and their
   cleanup, refs, dynamic `import()`, the WebGL frame loop, Reduce Motion.
   Then `space/galaxy.ts` and `space/background.ts` for the 3D itself.
4. **Pre-rendering and hydration.** `site/index.html` → `site/src/main.tsx` →
   `site/src/entry-server.tsx` → `scripts/prerender.mjs` →
   `components/Contact.tsx`.
   Try it: `npm run build && grep -o '<h1.*</h1>' dist/index.html` finds the
   heading in the file, before any JavaScript has run.
5. **Styling.** `site/src/styles/tokens.css` → `glass.css` → `global.css`:
   design tokens, dark mode, contrast, `backdrop-filter`.
   Try it: `npx vitest run tests/tokens.test.ts`
   Learn more: https://developer.apple.com/design/human-interface-guidelines/
6. **Tooling.** `package.json` (the `scripts`) → `vite.config.ts` →
   `tsconfig.json` → `eslint.config.js`. Try it: `npm run lint`
7. **Tests.** `vitest.config.ts` → `tests/setup.ts` → `tests/app.test.tsx` →
   `tests/prerender.test.ts`. Try it: `npx vitest` re-runs the affected tests
   every time you save.
8. **The container.** `Dockerfile` → `.dockerignore` → `nginx.conf`.
   Try it: `docker build -t portfolio . && docker run --rm -p 8080:8080 portfolio`,
   then `curl -sI http://localhost:8080/` in another terminal.
   Learn more: https://docs.docker.com/get-started/ and
   https://nginx.org/en/docs/beginners_guide.html
9. **Kubernetes objects.** `k8s/base/deployment.yaml` → `k8s/base/service.yaml`
   → `k8s/overlays/pi/`. Try it: `kubectl kustomize k8s/overlays/pi` prints the
   final manifests, base plus patches.
   Learn more: https://kubernetes.io/docs/concepts/
10. **The sandbox.** `k8s/tenant/`, then `tests/k8s.test.ts`: namespaces, RBAC,
    NetworkPolicy, admission policy, quota. Try it on the Pi, asking as Flux's
    account (prints `no`; ask about `create deployments` and it prints `yes`):

    ```bash
    kubectl auth can-i list secrets -n portfolio \
      --as=system:serviceaccount:flux-system:portfolio-reconciler
    ```

11. **The pipeline.** `.github/workflows/ci-cd.yml`, top to bottom, with a
    recent run open in the Actions tab next to it.
    Learn more: https://docs.github.com/en/actions
12. **GitOps.** `k8s/flux/`, then the Production section above.
    Try it (on the Pi): `kubectl -n flux-system get gitrepository,kustomization portfolio`
    Learn more: https://fluxcd.io/flux/concepts/

Then make it yours with the checklist, and practice with the exercises below.

## Make it yours: checklist

- [x] Name, about text and contact links (`site/src/data/profile.ts`)
- [x] `site/public/resume.pdf`
- [ ] Push the MikroTik lab notes to GitHub, then add a `Docs` link in `site/src/data/projects.ts`
- [ ] Art: replace the two "under construction" pieces in `site/src/components/Art.tsx` with
      screenshots/GIFs/turntables (keep files small, use `.webp`/`.mp4`, put them in `site/public/`)

## Learning exercises (do them one PR at a time)

1. **Break the build on purpose.** Give a project an unknown category in `projects.ts`, open a PR, watch `test` fail on the type check. Fix it.
2. **Branch protection.** Settings → Branches: require the `test`, `build` and `k8s-smoke-test` checks before merging to `main`.
3. **Add an Ingress.** Install ingress-nginx in the kind job and route a hostname to the Service.
4. **Autoscaling.** Add a `HorizontalPodAutoscaler` for the Deployment.
5. **Security scanning.** Add a Trivy image scan step to `build` and fail on critical CVEs.
6. **Preview environments.** Deploy each PR to its own namespace (`pr-123`) and comment the URL.
7. **Image automation.** Replace the `deploy` job with Flux's image-reflector and image-automation controllers, so the Pi notices new images by itself.
8. **Tech-art upgrade.** Give the map's star systems planets on orbits, or add a shooting star now and then to the background (respecting Reduce Motion and the pause button).
9. **Deploy status on commits.** Add a Flux `Provider` (type `github`) and `Alert` so each commit on GitHub shows whether it reached the Pi.

> **Adding Kubernetes objects** (exercises 3, 4 and 6): Flux's account may only
> manage the site's Deployment and Service in the `portfolio` namespace, and
> `tests/k8s.test.ts` checks the same. For a new kind of object, widen the Role
> in `k8s/tenant/rbac.yaml` for exactly that kind, update the test, and re-run
> `kubectl apply -k k8s/flux` on the Pi (Flux doesn't manage the tenant), or
> Flux won't be allowed to apply it. Per-PR namespaces (exercise 6) need more:
> the Role, quota and guardrails in `k8s/tenant/` cover only the `portfolio`
> namespace. Never swap in a built-in role like `edit`; see the trust boundary
> above.
