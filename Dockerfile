# Rhein Arts — retro arcade portal + games, served by nginx.
# Build from the repo root:  docker build --platform linux/amd64 -t ghcr.io/g33kde/rheinarts:v1 .
FROM nginx:1.27-alpine

# custom server config (healthz + gzip + caching)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# portal at web root, each game as a subpath
COPY web/      /usr/share/nginx/html/
COPY hyperout/ /usr/share/nginx/html/hyperout/

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1
