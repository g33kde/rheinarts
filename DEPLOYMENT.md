# Deploying Rhein Arts

Static site (retro portal + games) on **k3s + MetalLB**, LAN-only, HTTP.

- **Image:** `ghcr.io/g33kde/rheinarts:<tag>` (public GHCR package → no pull secret) -
  the tag actually running is whatever `k8s/rheinarts.yaml` declares; that file
  is the source of truth, see "Updating" below.
- **Serves:** portal at `/`, HyperOut at `/hyperout/`, Godspeed at `/godspeed/`
- **Access:** the LAN IP MetalLB assigns to the `LoadBalancer` Service

Godspeed (`godspeed/game`) is a Vite/TypeScript build, not static files like
HyperOut - the image build now has a `node:22-alpine` stage that runs
`npm ci && npm run build` before the final `nginx:1.27-alpine` stage copies
its `dist/` output in. Nothing extra to do here - `docker build` handles
both stages in one command, same as before.

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

## Later: public domain (www.rheinarts.de)

Deferred (LAN-only for now). When ready, pick one:
- **Cloudflare Tunnel** — `cloudflared` in-cluster, outbound only, free edge TLS, no port-forwarding.
- **Router port-forward + DDNS** — forward 80/443 to the Service IP; TLS via cert-manager + Let's Encrypt.

Both need the DNS for `rheinarts.de` managed accordingly. Ping me and I'll add the manifests.
