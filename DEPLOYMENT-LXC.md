# Deploying Rhein Arts on a Proxmox LXC (no Kubernetes)

An alternative to `DEPLOYMENT.md`'s k3s/MetalLB path: one unprivileged
Debian LXC container on Proxmox, running nginx + the two Vite game
builds + the highscore API natively — no Docker, no cluster. Simpler
operationally (no registry, no image tags, no manifests), at the cost
of losing image-based rollback and PVC-style storage abstraction — the
leaderboard file just lives on the LXC's own disk, backed up via
Proxmox's own `vzdump` instead.

- **Serves:** portal at `/`, HyperOut at `/hyperout/`, Godspeed at
  `/godspeed/`, Debris at `/debris/`, Debris's leaderboard API proxied
  at `/api/debris/` — same URL layout as the k3s deployment, so nothing
  about the games themselves needs to change.
- **Access:** the LXC's own static LAN IP (set at install time).

Prereqs: a Proxmox host, root shell access.

---

## Quick install

```bash
./install-lxc.sh
```

Prompts for **container ID, hostname, LXC template, disk size, CPU
cores, memory, swap, network bridge, static IP, gateway, and a root
password** — each shows a default in `[brackets]`, press Enter to
accept it or type your own value. Everything else (repo URL, storage,
Node.js version, API port, install path) is fixed, not prompted —
those aren't meant to vary between installs.

The template prompt is an interactive picker, not free text: it lists
whatever LXC templates are already downloaded on this host first (no
network needed), or — if nothing's downloaded yet — queries Proxmox's
own catalog (`pveam available`) for current Debian 11/12 and Ubuntu
22.04/24.04 templates, lets you pick one, and downloads it
automatically. Typing something that isn't one of the numbered choices
is taken as a literal template volid, for anyone who already knows
exactly what they want.

The root password prompt is optional (hidden input, confirmed twice) —
leave it blank to skip, same as not setting one at all. `pct enter
<CTID>` from the Proxmox host never needs a password regardless, since
it attaches via the host's own root trust; skipping just means the
Proxmox web console, `pct console`, and SSH won't accept a login until
you run `pct exec <CTID> -- passwd` yourself later.

To automate with **no prompts at all** (including the template picker
and the password prompt — automated runs never set one, regardless of
environment): export the variables first and pass `-y`. `TEMPLATE`
must already be downloaded in this mode, since there's no interactive
picker to fall back on:

```bash
CTID=210 HOSTNAME=rheinarts IP_CIDR=192.168.1.60/24 GATEWAY=192.168.1.1 \
  TEMPLATE=local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst \
  ./install-lxc.sh -y
```

When it finishes, it prints the portal URL, the Debris URL, and a
sample leaderboard API call to confirm everything's reachable.

---

## What actually changes vs. the k3s path

- **No Docker at all.** Docker-in-LXC needs nesting/privileged tricks
  that Proxmox setups generally avoid — Node.js and nginx install
  directly on the container's own OS instead.
- **No image registry, no tags, no `kubectl apply`.** Updating means
  `git pull` + rebuild + `systemctl restart`, directly on the box (see
  "Updating" below).
- **The `nginx.conf` resolver/variable-`proxy_pass` dance is gone.**
  That machinery exists solely to survive Kubernetes' dynamic service
  DNS and pod-scheduling races — here the highscore API is a fixed
  `127.0.0.1:8081` on the same LXC, which nginx resolves normally at
  startup, no workaround needed.
- **No MetalLB/LoadBalancer.** The LXC just gets a normal static LAN IP
  straight from Proxmox's own network config.
- **Real trade-off:** no image-based rollback to a tagged version if a
  build goes wrong (`git checkout <previous-commit>` + rebuild is the
  equivalent, slower than re-applying an old tag), and the leaderboard
  file lives on the LXC's own disk rather than a PVC — back it up via
  Proxmox's own `vzdump` if it should survive a container rebuild.

---

## What the installer does, step by step

Useful as reference, or as a manual fallback if you'd rather not run
one script.

### 1. Create the LXC

```bash
pct create 200 local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst \
  --hostname rheinarts \
  --cores 2 \
  --memory 1024 \
  --swap 512 \
  --rootfs local-lvm:8 \
  --net0 name=eth0,bridge=vmbr0,ip=192.168.1.50/24,gw=192.168.1.1 \
  --unprivileged 1 \
  --features nesting=0 \
  --onboot 1
pct start 200
pct enter 200
```

1 vCPU / 512MB is enough at idle, but an in-place `npm run build`
briefly wants more — 2 cores / 1GB avoids a slow first build.
`nesting=0` is deliberate: this container never runs Docker, so it
doesn't need it.

### 2. Install Node.js and nginx

Everything from here runs **inside** the container.

```bash
apt update && apt install -y curl git nginx

curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs

node -v   # v22.x
```

Debian 12's own repo only has Node 18 — NodeSource's setup script adds
a repo for Node 22, matching the version the Docker build already
targets (`node:22-alpine`).

### 3. Get the code and build both games

```bash
git clone https://github.com/g33kde/rheinarts.git /opt/rheinarts
cd /opt/rheinarts

cd godspeed/game && npm ci && npm run build && cd ../..
cd debris/game   && npm ci && npm run build && cd ../..
```

Same two `npm ci && npm run build` steps the Dockerfile's own build
stages run — each Vite project's `publicDir` (`../music`) resolves
correctly since `godspeed/` and `debris/` keep their real repo layout
here, unlike the Docker build's flattened `/app` + `/music` copy.

### 4. Lay out the web root

```bash
mkdir -p /usr/share/nginx/html
cp -r web/*      /usr/share/nginx/html/
cp -r hyperout    /usr/share/nginx/html/hyperout
mkdir -p /usr/share/nginx/html/godspeed /usr/share/nginx/html/debris
cp -r godspeed/game/dist/* /usr/share/nginx/html/godspeed/
cp -r debris/game/dist/*   /usr/share/nginx/html/debris/
```

Mirrors the Dockerfile's four `COPY` lines exactly — portal + HyperOut
copied as-is (no build step, same as the image), Godspeed/Debris from
their own `dist/` output.

### 5. Deploy the highscore API as a systemd service

```bash
cd /opt/rheinarts/debris/highscore-api
npm ci
npm run build          # -> dist/server.js

mkdir -p /var/lib/debris-highscore-api
```

```ini
# /etc/systemd/system/debris-highscore-api.service
[Unit]
Description=Debris high-score leaderboard API
After=network.target

[Service]
Environment=PORT=8081
Environment=HIGHSCORE_FILE_PATH=/var/lib/debris-highscore-api/debris-highscores.json
ExecStart=/usr/bin/node /opt/rheinarts/debris/highscore-api/dist/server.js
Restart=on-failure
User=www-data

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now debris-highscore-api
systemctl status debris-highscore-api   # should be "active (running)"
curl -s http://127.0.0.1:8081/healthz   # -> ok
```

Same `PORT`/`HIGHSCORE_FILE_PATH` env vars the k8s Deployment sets —
only the storage backing changes (the LXC's own disk under
`/var/lib/`, not a PVC). Include `/var/lib/debris-highscore-api/` in
your Proxmox backup job (`vzdump`) if you want the leaderboard to
survive a container rebuild.

### 6. nginx config

Drop this in as `/etc/nginx/sites-available/rheinarts` (and symlink
into `sites-enabled`, removing the default site):

```nginx
server {
    listen       80;
    server_name  _;

    root   /usr/share/nginx/html;
    index  index.html;

    location = /healthz {
        access_log off;
        add_header Content-Type text/plain;
        return 200 "ok\n";
    }

    location = /hyperout { return 301 /hyperout/; }
    location = /godspeed { return 301 /godspeed/; }
    location = /debris   { return 301 /debris/; }

    # No resolver/variable-target dance here, unlike nginx.conf's k8s
    # version - the API is a fixed loopback address on this same LXC,
    # so nginx resolves it once at startup like any normal upstream.
    location /api/debris/ {
        rewrite ^/api/debris/(.*)$ /$1 break;
        proxy_pass http://127.0.0.1:8081;
        proxy_set_header Host $host;
    }

    location / {
        try_files $uri $uri/ =404;
        add_header Cache-Control "no-cache";
    }

    error_page 404 /404.html;

    gzip            on;
    gzip_types      text/plain text/css application/javascript application/json image/svg+xml;
    gzip_min_length 512;

    location ~* \.(html|js|css|svg)$ {
        add_header Cache-Control "no-cache";
    }
    location ~* \.(png|jpg|jpeg|ico|woff2?)$ {
        expires 1h;
        add_header Cache-Control "public, max-age=3600, must-revalidate";
    }
    location ~* \.(mp3|wav)$ {
        expires 7d;
        add_header Cache-Control "public, max-age=604800";
    }
}
```

```bash
ln -s /etc/nginx/sites-available/rheinarts /etc/nginx/sites-enabled/rheinarts
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

### 7. Open it

`http://192.168.1.50/` (whatever static IP was set at install time) —
the portal, with HyperOut/Godspeed/Debris one click away and Debris's
leaderboard hitting the systemd service over loopback.

---

## Updating

No image tags to bump. `update-lxc.sh` (repo root, alongside
`install-lxc.sh`) lands automatically at `/opt/rheinarts/update-lxc.sh`
as part of the `git clone` the installer already does — nothing
separate to download. Pull, rebuild, restart, in one command:

```bash
pct exec <CTID> -- /opt/rheinarts/update-lxc.sh
```

(or `pct enter <CTID>` and run `/opt/rheinarts/update-lxc.sh` directly
from inside). It always rebuilds all three projects (both games + the
highscore API) rather than trying to detect what changed — slower than
strictly necessary on a no-op update, but it can't miss one by guessing
wrong.

The manual equivalent, if you'd rather not run the script:

```bash
cd /opt/rheinarts && git pull

cd godspeed/game && npm ci && npm run build && cd ../..
cp -r godspeed/game/dist/* /usr/share/nginx/html/godspeed/

cd debris/game && npm ci && npm run build && cd ../..
cp -r debris/game/dist/* /usr/share/nginx/html/debris/

# portal/HyperOut changed too?
cp -r web/* /usr/share/nginx/html/
cp -r hyperout/* /usr/share/nginx/html/hyperout/

# highscore-api changed?
cd debris/highscore-api && npm ci && npm run build && cd ../..
systemctl restart debris-highscore-api
```

`nginx -s reload` only if `nginx.conf` itself changed — static file
updates need no nginx restart at all (no-cache headers mean the next
request just picks them up). Neither the script nor the manual steps
touch the nginx site config itself — that's generated once at install
time, not tracked by this repo; a config change is a manual re-apply.

**Real trade-off vs. the k8s path**: there's no tagged image to roll
back to if a build goes wrong — `git checkout <previous-commit>` and
rebuild is the equivalent, slower than `kubectl apply` with an old tag.
Fine for a single LAN box; worth knowing if that matters to you.
