# The recipe for the production container image: build the site with Node.js,
# then serve the result with nginx. CI builds it (.github/workflows/ci-cd.yml),
# GitHub Container Registry (GHCR) stores it, and Kubernetes runs it on the Pi
# (k8s/base/deployment.yaml).
#
# This is a multi-stage build. Each FROM starts a fresh image (a "stage"), and
# only the last stage becomes the image that ships. Building the site needs
# Node.js and hundreds of npm packages; serving it needs none of them. So the
# final image gets just the finished files, which keeps it small and leaves an
# attacker much less software to abuse.
#
# Layer caching: Docker caches the result of every step (most add a filesystem
# "layer"). When a step's inputs change, that step and every step after it run
# again, so the steps whose inputs change least come first.
#
# The files the build can see (the "build context") are filtered by
# .dockerignore, so the local node_modules/, dist/, .git/, tests/ and k8s/
# never reach the builder.
#
# Try it: docker build -t portfolio . && docker run --rm -p 8080:8080 portfolio
#   then open http://localhost:8080. `docker history portfolio` lists the layers.
# Learn more: https://docs.docker.com/build/building/multi-stage/

# 1) Build stage: turn the React + TypeScript source into static files in dist/.
#    `--platform=$BUILDPLATFORM` runs this stage on the build machine's own CPU
#    even when the image is for arm64 (the Pi). BuildKit, Docker's builder, sets
#    BUILDPLATFORM (the machine doing the build) and TARGETPLATFORM (the machine
#    that will run the image) automatically. That's safe here because the output
#    is plain HTML/CSS/JS, the same for every architecture, and building natively
#    avoids slow QEMU emulation. The final stage has no --platform, so it is
#    built for the target. `AS build` names this stage so the final one can copy
#    from it. "-alpine" images are based on Alpine Linux, a very small distro.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app
# Dependencies first, on their own: this slow `npm ci` layer stays cached until
# package.json or package-lock.json changes, so editing the site doesn't
# reinstall every package. `npm ci` installs exactly what the lockfile says (and
# fails if it disagrees with package.json), so every build gets the same versions.
# --no-audit and --no-fund skip npm's audit report and funding messages, which
# only slow down and clutter a build.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
# Then the build config and the source, which change more often. `npm run build`
# bundles the app with Vite and pre-renders it to HTML (scripts/prerender.mjs).
COPY vite.config.ts tsconfig.json ./
COPY scripts/ scripts/
COPY site/ site/
RUN npm run build

# 2) Runtime stage: the image that actually ships. nginx-unprivileged is a
#    variant of nginx, maintained by the nginx team, that runs as a normal user
#    (UID 101) instead of root and listens on 8080, because Linux traditionally
#    lets only root open ports below 1024. If someone ever broke into nginx, they
#    would not be root inside the container. Kubernetes double-checks this
#    (runAsNonRoot in k8s/base/deployment.yaml, "restricted" in k8s/tenant/).
FROM nginxinc/nginx-unprivileged:1.27-alpine

# The image's main /etc/nginx/nginx.conf includes conf.d/*.conf inside its
# http {} block, so this replaces the default site with ours.
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Copy only the finished site out of the build stage. Node.js, node_modules and
# the source code stay behind and never ship.
COPY --from=build /app/dist/ /usr/share/nginx/html/

# CI passes the commit SHA so the deployed site can show which build it is
# (curl https://ttaekratok.com/version.json); a local build gets "dev". An ARG
# that changes invalidates the cache only from where it is first used, which is
# why it comes this late: a new commit SHA alone never rebuilds the layers above.
ARG GIT_SHA=dev
# The web root belongs to root, so switch to root just long enough to write
# version.json, then straight back.
USER root
RUN printf '{"commit":"%s"}\n' "$GIT_SHA" > /usr/share/nginx/html/version.json
# 101 is the unprivileged nginx user baked into the base image. Use the number,
# not the name: Kubernetes' runAsNonRoot check can only verify a numeric user.
# Try it: docker run --rm portfolio id   (prints uid=101)
USER 101

# Documents the port nginx listens on; it doesn't open anything by itself.
# `docker run -p 8080:8080` and the Kubernetes Service do the actual exposing.
EXPOSE 8080
