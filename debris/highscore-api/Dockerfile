# Debris high-score leaderboard API - the first backend service in Rhein
# Arts (everything else the portal serves is static files behind nginx).
# Build from this directory:  docker build -t ghcr.io/g33kde/debris-highscore-api:v1 .

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Runtime has zero third-party dependencies - server.ts only imports
# Node built-ins (node:http, node:fs/promises, node:path) plus its own
# sibling files - so the final image just needs the compiled dist/, no
# node_modules at all.
FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist/ ./dist/

ENV PORT=8081
# Overridden in k8s to the PersistentVolumeClaim's mount path - this
# default is only what a bare `docker run` without a volume gets (data
# won't survive a container restart in that case, same as any other
# unmounted container filesystem).
ENV HIGHSCORE_FILE_PATH=/data/debris-highscores.json

EXPOSE 8081

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8081/healthz || exit 1

CMD ["node", "dist/server.js"]
