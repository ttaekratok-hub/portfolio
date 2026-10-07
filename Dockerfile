# Serve the static site with nginx running as a non-root user on port 8080.
FROM nginxinc/nginx-unprivileged:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY site/ /usr/share/nginx/html/

# CI passes the commit SHA so the deployed site can show which build it is.
ARG GIT_SHA=dev
USER root
RUN printf '{"commit":"%s"}\n' "$GIT_SHA" > /usr/share/nginx/html/version.json
# 101 is the unprivileged nginx user baked into the base image.
USER 101

EXPOSE 8080
