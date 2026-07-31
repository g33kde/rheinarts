# Deploying Rhein Arts

Static site (retro portal + games) on **k3s + MetalLB**, LAN-only, HTTP.

- **Image:** `ghcr.io/g33kde/rheinarts:v1` (public GHCR package → no pull secret)
- **Serves:** portal at `/`, HyperOut at `/hyperout/`
- **Access:** the LAN IP MetalLB assigns to the `LoadBalancer` Service

Prereqs on your machine: `docker`, `kubectl` (pointed at the cluster).

---

## 1. Build the image

Match your cluster nodes' architecture (`--platform`): `linux/amd64` for x86 nodes,
`linux/arm64` for Raspberry Pi. Run from the repo root:

```bash
docker build --platform linux/amd64 -t ghcr.io/g33kde/rheinarts:v1 .
```

## 2. Push to GHCR

Needs a GitHub token with **`write:packages`** (your current `gh` token does not have
this scope — create a classic PAT with `write:packages`, or `gh auth refresh -s write:packages`).

```bash
echo "$CR_PAT" | docker login ghcr.io -u g33kde --password-stdin
```
```bash
docker push ghcr.io/g33kde/rheinarts:v1
```

Then make the package **public** so the cluster can pull without a secret:
GitHub → your profile → Packages → `rheinarts` → Package settings → Change visibility → Public.
(If you'd rather keep it private, tell me and I'll add an `imagePullSecret`.)

## 3. Deploy

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

Rebuild with a new tag (`:v2`), push, then:

```bash
kubectl -n rheinarts set image deploy/rheinarts web=ghcr.io/g33kde/rheinarts:v2
```

---

## Later: public domain (www.rheinarts.de)

Deferred (LAN-only for now). When ready, pick one:
- **Cloudflare Tunnel** — `cloudflared` in-cluster, outbound only, free edge TLS, no port-forwarding.
- **Router port-forward + DDNS** — forward 80/443 to the Service IP; TLS via cert-manager + Let's Encrypt.

Both need the DNS for `rheinarts.de` managed accordingly. Ping me and I'll add the manifests.
