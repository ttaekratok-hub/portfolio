# 1) Build the React site into static files (dist/). This stage runs on the
#    build machine's own CPU even when the image is for arm64: the output is
#    plain HTML/CSS/JS, so it's the same for every architecture, and building
#    natively avoids slow QEMU emulation.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY vite.config.ts tsconfig.json ./
COPY scripts/ scripts/
COPY site/ site/
RUN npm run build

# 2) Serve the static files with nginx running as a non-root user on port 8080.
FROM nginxinc/nginx-unprivileged:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/ /usr/share/nginx/html/

# CI passes the commit SHA so the deployed site can show which build it is.
ARG GIT_SHA=dev
USER root
RUN printf '{"commit":"%s"}\n' "$GIT_SHA" > /usr/share/nginx/html/version.json
# 101 is the unprivileged nginx user baked into the base image.
USER 101

EXPOSE 8080
