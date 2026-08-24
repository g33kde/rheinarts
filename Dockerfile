# Rhein Arts — retro arcade portal + games, served by nginx.
# Build from the repo root:  docker build --platform linux/amd64 -t ghcr.io/g33kde/rheinarts:v1 .

# Godspeed (godspeed/game) is a Vite/TypeScript build, unlike the other
# static-file games - needs an actual build stage before nginx can serve it.
FROM node:22-alpine AS godspeed-build
WORKDIR /app
COPY godspeed/game/package.json godspeed/game/package-lock.json ./
RUN npm ci
COPY godspeed/game/ ./
# godspeed/music/ is a sibling of godspeed/game/ in the repo; mirror that
# relative layout here so vite.config.ts's publicDir ('../music') resolves
# the same way in Docker as it does locally.
COPY godspeed/music/ /music/
RUN npm run build

# Debris (debris/game) is also a Vite/TypeScript build, same reason and
# same sibling-publicDir layout as Godspeed above.
FROM node:22-alpine AS debris-build
WORKDIR /app
COPY debris/game/package.json debris/game/package-lock.json ./
RUN npm ci
COPY debris/game/ ./
COPY debris/music/ /music/
RUN npm run build

FROM nginx:1.27-alpine

# custom server config (healthz + gzip + caching + the /api/debris/ proxy)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Substitutes nginx.conf's __COREDNS_IP__ placeholder (the /api/debris/
# proxy's resolver) at container startup, before nginx runs - see the
# script itself and nginx.conf's `resolver` comment for why this can't
# just be a hardcoded value. nginx:alpine's own entrypoint runs every
# script in /docker-entrypoint.d/ automatically; ownership/mode need to
# survive Windows' own COPY (which doesn't preserve the executable bit).
COPY docker/resolve-coredns.sh /docker-entrypoint.d/40-resolve-coredns.sh
RUN chmod +x /docker-entrypoint.d/40-resolve-coredns.sh

# portal at web root, each game as a subpath
COPY web/      /usr/share/nginx/html/
COPY hyperout/ /usr/share/nginx/html/hyperout/
COPY --from=godspeed-build /app/dist/ /usr/share/nginx/html/godspeed/
COPY --from=debris-build   /app/dist/ /usr/share/nginx/html/debris/

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1
