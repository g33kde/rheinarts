# Deploying Rhein Arts

Static site (retro portal + games) on **k3s + MetalLB**, LAN-only, HTTP -
plus one small backend service for Debris's high-score leaderboard (see
"Deploying the high-score API" below), the only dynamic part of the
whole portal.

- **Image:** `ghcr.io/g33kde/rheinarts:<tag>` (public GHCR package → no pull secret) -
  the tag actually running is whatever `k8s/rheinarts.yaml` declares; that file
  is the source of truth, see "Updating" below. **Two images are tracked in that
  one file now** - this one (the static portal) and
  `ghcr.io/g33kde/debris-highscore-api:<tag>` (see below) - each with its own
  `image:` line, versioned and deployed independently.
- **Serves:** portal at `/`, HyperOut at `/hyperout/`, Godspeed at `/godspeed/`,
  Debris at `/debris/`, Debris's leaderboard API proxied at `/api/debris/`
- **Access:** the LAN IP MetalLB assigns to the `LoadBalancer` Service

Godspeed (`godspeed/game`) and Debris (`debris/game`) are both Vite/TypeScript
builds, not static files like HyperOut - the image build has a `node:22-alpine`
stage per game that runs `npm ci && npm run build` before the final
`nginx:1.27-alpine` stage copies each one's `dist/` output in. Nothing extra to
do here - `docker build` handles all the stages in one command, same as before.

Prereqs on your machine: `docker`, `kubectl` (pointed at the cluster).

---

Pick the next tag by checking what's currently deployed:
`kubectl -n rheinarts get deploy rheinarts -o jsonpath='{.spec.template.spec.containers[0].image}'`
(or just read the `image:` line in `k8s/rheinarts.yaml` — they should always
match; see "Updating" below for why).

## 1. Build the image

Match your cluster nodes' architecture (`--platform`): `linux/amd64` for x86 nodes,
`linux/arm64` for Raspberry Pi. Run from the repo root, replacing `<tag>`
with the next version (e.g. `v5` if `v4` is current):

```bash
docker build --platform linux/amd64 -t ghcr.io/g33kde/rheinarts:<tag> .
```

## 2. Push to GHCR

Needs a GitHub token with **`write:packages`** (your current `gh` token does not have
this scope — create a classic PAT with `write:packages`, or `gh auth refresh -s write:packages`).

```bash
echo "$CR_PAT" | docker login ghcr.io -u g33kde --password-stdin
```
```bash
docker push ghcr.io/g33kde/rheinarts:<tag>
```

Then make the package **public** so the cluster can pull without a secret
(only needed the first time a given tag is pushed):
GitHub → your profile → Packages → `rheinarts` → Package settings → Change visibility → Public.
(If you'd rather keep it private, tell me and I'll add an `imagePullSecret`.)

## 3. Deploy

**Edit `k8s/rheinarts.yaml` first** - update the `image:` line (and the header
comment above it) to the tag you just pushed. This file is the single source
of truth for what's deployed; skipping this step and deploying some other way
(see "Updating" below for why that's a trap) means the *next* person to run
`kubectl apply` will silently roll the cluster back to whatever tag is still
written here.

```bash
kubectl apply -f k8s/rheinarts.yaml
```

## 4. Find the assigned IP and open it

```bash
kubectl -n rheinarts get svc rheinarts -w
```

When `EXTERNAL-IP` is populated (from the MetalLB pool, e.g. `192.168.1.23x`), open:
`http://<EXTERNAL-IP>/` — the game is at `http://<EXTERNAL-IP>/hyperout/`.

## Updating

**Always edit `k8s/rheinarts.yaml`'s `image:` line and re-apply it** - that's
steps 1-3 above with a new tag. Don't use `kubectl set image` as a shortcut:
it changes the *live* Deployment directly without touching this file, so the
file silently falls out of sync with what's actually running - and the next
plain `kubectl apply -f k8s/rheinarts.yaml` (by you, days later, or anyone
else) will revert the cluster back to the stale tag still written in the
file. This exact thing happened once already; don't repeat it. If you really
need a fast one-off rollout, `kubectl set image` still works, but immediately
also update `k8s/rheinarts.yaml` to match so the file stays true.

---

## Deploying the high-score API

Debris's global top-10 leaderboard - `debris/highscore-api`, a small
standalone Node service, the first backend in Rhein Arts. Its own image,
its own tag, built/pushed/deployed the same way as the portal image
above but from a different directory - **not** part of the root
`Dockerfile`.

- **Image:** `ghcr.io/g33kde/debris-highscore-api:<tag>` (also needs to be
  made public on GHCR the first time a given tag is pushed, same as the
  portal image - see step 2 above).
- **Runs as:** its own `Deployment` (`debris-highscore-api`, `replicas: 1` -
  deliberately not 2, see the comment above it in `k8s/rheinarts.yaml` for
  why), a `ClusterIP` `Service` (internal only - nginx is the only thing
  that calls it, via the `/api/debris/` proxy in `nginx.conf`), and a
  `PersistentVolumeClaim` (`debris-highscores-pvc`) so the leaderboard
  files (three now, one per game mode - `HIGHSCORE_FILE_PATH` plus a
  `-cooperative`/`-competitive` sibling each, see
  `debris/highscore-api/src/leaderboard.ts`'s `filePathForMode`) survive
  pod restarts/reschedules.

### 1. Build the API image

```bash
cd debris/highscore-api
docker build --platform linux/amd64 -t ghcr.io/g33kde/debris-highscore-api:<tag> .
cd ../..
```

### 2. Push the API image

Same GHCR login as the portal image (step 2 above) covers this too -
no separate credentials needed, just push the new image:

```bash
docker push ghcr.io/g33kde/debris-highscore-api:<tag>
```

### 3. Deploy the API

**Edit `k8s/rheinarts.yaml`'s `debris-highscore-api` Deployment's `image:`
line** to the tag just pushed - same "this file is the source of truth,
don't `kubectl set image` around it" rule as the portal image. Both
images can be bumped in the same edit/apply if you're deploying both at
once, or independently if only one changed.

```bash
kubectl apply -f k8s/rheinarts.yaml
```

No separate "find the IP" step - it's `ClusterIP`, reached only through
the portal's own LoadBalancer IP at `/api/debris/`.

**Honest limitation, not a deployment gap**: this API does basic input
validation (initials must be 3 letters, score must be a plausible
number) but no gameplay verification - there's no way to confirm a
submitted score was actually earned. Fine for a LAN-only hobby leaderboard,
worth knowing before treating it as tamper-proof.

---

## Later: public domain (www.rheinarts.de)

Deferred (LAN-only for now). When ready, pick one:
- **Cloudflare Tunnel** — `cloudflared` in-cluster, outbound only, free edge TLS, no port-forwarding.
- **Router port-forward + DDNS** — forward 80/443 to the Service IP; TLS via cert-manager + Let's Encrypt.

Both need the DNS for `rheinarts.de` managed accordingly. Ping me and I'll add the manifests.
