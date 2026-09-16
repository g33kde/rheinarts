#!/usr/bin/env bash
# Rhein Arts — LXC installer (run on the Proxmox HOST, not inside a container).
#
# Creates an unprivileged Debian LXC, then provisions it end-to-end:
# Node.js + nginx, both game builds, the highscore API as a systemd
# service, and the nginx config wiring it all together. Equivalent to
# DEPLOYMENT-LXC.md's manual steps, just scripted.
#
# Run as root on the Proxmox host:
#   ./install-lxc.sh
#
# Prompts for: container ID, hostname, LXC template (an interactive
# picker - see select_template() below), disk/CPU/memory/swap, network
# bridge, static IP, gateway, and a root password (hidden input, see
# prompt_password() below). Each shows a default in [brackets] - press
# Enter to accept it. Everything else (repo URL, storage, Node version,
# API port, install path) is fixed in the "not prompted" block below,
# not meant to vary between installs.
#
# The root password prompt is optional - leave it blank to skip
# (matches the original behavior: no password set, console/SSH login
# unavailable until you run `pct exec <CTID> -- passwd` yourself).
# `pct enter <CTID>` from the Proxmox host never needs a password
# regardless, since it attaches via the host's own root trust.
#
# To automate (no prompts, including the template picker AND the
# password prompt - automated runs never set one, regardless of
# environment), export the variables first and pass -y - TEMPLATE must
# already be downloaded in this mode (see 'pveam list local'), since
# there's no interactive picker to fall back on:
#   CTID=210 HOSTNAME=rheinarts IP_CIDR=192.168.1.60/24 GATEWAY=192.168.1.1 \
#     TEMPLATE=local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst \
#     ./install-lxc.sh -y
#
# update-lxc.sh (repo root, alongside this script) lands automatically
# at /opt/rheinarts/update-lxc.sh as part of the git clone below -
# nothing extra to download. Run it later, inside the container, to
# pull + rebuild + restart everything in one step.

set -euo pipefail

# --- Fixed - not prompted, not meant to vary between installs ---
readonly REPO_URL="https://github.com/g33kde/rheinarts.git"
readonly STORAGE="local-lvm"
readonly NODE_MAJOR="22"
readonly API_PORT="8081"
readonly INSTALL_PATH="/opt/rheinarts"

ASSUME_YES=0
[[ "${1:-}" == "-y" ]] && ASSUME_YES=1

prompt() {
  # prompt VAR_NAME "Question text" "default value"
  local var_name="$1" question="$2" default="$3" current answer
  current="${!var_name:-$default}"
  if [[ "$ASSUME_YES" == "1" ]]; then
    printf -v "$var_name" '%s' "$current"
    return
  fi
  read -rp "$question [$current]: " answer
  printf -v "$var_name" '%s' "${answer:-$current}"
}

# Interactive template picker (skipped under -y, see below) - offers
# whatever's already downloaded on this host first (fastest, no
# network needed), falling back to a short list of current Debian/
# Ubuntu templates pulled live from Proxmox's own catalog
# (`pveam available`) if nothing's downloaded yet, downloading
# whichever one is chosen. A raw answer that isn't one of the numbered
# choices is taken as a literal template volid instead, for anyone who
# already knows exactly what they want.
select_template() {
  if [[ "$ASSUME_YES" == "1" ]]; then
    TEMPLATE="${TEMPLATE:-local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst}"
    return
  fi

  local downloaded=()
  while IFS= read -r line; do
    [[ -n "$line" ]] && downloaded+=("$line")
  done < <(pveam list local 2>/dev/null | awk 'NR>1 {print $1}')

  if [[ ${#downloaded[@]} -gt 0 ]]; then
    echo "LXC template - already downloaded on this host:"
    local i=1
    for t in "${downloaded[@]}"; do
      echo "  $i) $t"
      i=$((i + 1))
    done
    echo "  $i) Download a different one instead"
    local choice
    read -rp "Choose [1]: " choice
    choice="${choice:-1}"
    if [[ "$choice" =~ ^[0-9]+$ ]] && (( choice >= 1 && choice <= ${#downloaded[@]} )); then
      TEMPLATE="${downloaded[$((choice - 1))]}"
      return
    elif ! [[ "$choice" =~ ^[0-9]+$ ]]; then
      TEMPLATE="$choice" # treated as a literal volid the user typed directly
      return
    fi
    # otherwise: fall through to the download flow below
  fi

  echo "Checking Proxmox's template catalog (pveam update)..."
  pveam update >/dev/null 2>&1 || true
  local catalog=()
  while IFS= read -r line; do
    [[ -n "$line" ]] && catalog+=("$line")
  done < <(pveam available 2>/dev/null | awk '$1=="system"{print $2}' | grep -E '^(debian-1[12]|ubuntu-(22|24)\.04)-standard' | sort -V)

  if [[ ${#catalog[@]} -eq 0 ]]; then
    echo "Could not read the template catalog - falling back to a known default."
    echo "(Check manually with 'pveam available' if this isn't what you want.)"
    TEMPLATE="local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst"
    return
  fi

  echo "LXC template - available to download:"
  local i=1
  for t in "${catalog[@]}"; do
    echo "  $i) $t"
    i=$((i + 1))
  done
  local pick
  read -rp "Choose [1]: " pick
  pick="${pick:-1}"
  local selected
  if [[ "$pick" =~ ^[0-9]+$ ]] && (( pick >= 1 && pick <= ${#catalog[@]} )); then
    selected="${catalog[$((pick - 1))]}"
  else
    selected="$pick" # literal template filename the user typed directly
  fi
  echo "Downloading $selected..."
  pveam download local "$selected"
  TEMPLATE="local:vztmpl/$selected"
}

# Optional root password (skipped entirely under -y, no env var
# override - confirmed via AskUserQuestion: automated runs never set
# one). Hidden input (read -rs), confirmed twice to catch typos. A
# blank first entry, or a confirmation that doesn't match, skips
# password setup - same as the original no-password behavior - rather
# than looping or failing the whole install over it.
prompt_password() {
  ROOT_PASSWORD=""
  if [[ "$ASSUME_YES" == "1" ]]; then
    return
  fi

  echo
  echo "Root password for console/SSH login (pct enter needs none - this"
  echo "is only for the Proxmox web console, 'pct console', and SSH)."
  local pw1 pw2
  read -rsp "Root password [leave blank to skip]: " pw1
  echo
  if [[ -z "$pw1" ]]; then
    echo "Skipping - set one later with: pct exec <CTID> -- passwd"
    return
  fi
  read -rsp "Confirm root password: " pw2
  echo
  if [[ "$pw1" != "$pw2" ]]; then
    echo "Passwords didn't match - skipping. Set one later with: pct exec <CTID> -- passwd"
    return
  fi
  ROOT_PASSWORD="$pw1"
}

echo "=== Rhein Arts LXC installer ==="
echo

prompt CTID       "Container ID"                                   "200"
prompt HOSTNAME   "Container hostname"                              "rheinarts"
select_template
prompt DISK_GB    "Disk size (GB)"                                  "8"
prompt CORES      "CPU cores"                                       "2"
prompt MEMORY_MB  "Memory (MB)"                                      "1024"
prompt SWAP_MB    "Swap (MB)"                                        "512"
prompt BRIDGE     "Network bridge"                                   "vmbr0"
prompt IP_CIDR    "Static IP, with prefix (e.g. 192.168.1.50/24)"    "192.168.1.50/24"
prompt GATEWAY    "Gateway"                                          "192.168.1.1"
prompt_password

echo
echo "=== Creating LXC $CTID ($HOSTNAME) ==="
PCT_CREATE_EXTRA_ARGS=()
ROOT_PASSWORD_WAS_SET=0
if [[ -n "$ROOT_PASSWORD" ]]; then
  PCT_CREATE_EXTRA_ARGS+=(--password "$ROOT_PASSWORD")
  ROOT_PASSWORD_WAS_SET=1
fi
pct create "$CTID" "$TEMPLATE" \
  --hostname "$HOSTNAME" \
  --cores "$CORES" \
  --memory "$MEMORY_MB" \
  --swap "$SWAP_MB" \
  --rootfs "${STORAGE}:${DISK_GB}" \
  --net0 "name=eth0,bridge=${BRIDGE},ip=${IP_CIDR},gw=${GATEWAY}" \
  --unprivileged 1 \
  --features nesting=0 \
  --onboot 1 \
  "${PCT_CREATE_EXTRA_ARGS[@]}"
unset ROOT_PASSWORD PCT_CREATE_EXTRA_ARGS

pct start "$CTID"
echo "Waiting for network..."
for _ in $(seq 1 15); do
  pct exec "$CTID" -- true 2>/dev/null && break
  sleep 1
done

echo
echo "=== Installing Node.js $NODE_MAJOR + nginx ==="
pct exec "$CTID" -- bash -c "
  set -e
  apt-get update -qq && apt-get install -y -qq curl git nginx
  curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash - >/dev/null
  apt-get install -y -qq nodejs
"

echo
echo "=== Cloning and building ==="
pct exec "$CTID" -- bash -c "
  set -e
  git clone --quiet '$REPO_URL' '$INSTALL_PATH'
  chmod +x '$INSTALL_PATH/update-lxc.sh'
  cd '$INSTALL_PATH/godspeed/game' && npm ci --silent && npm run build --silent
  cd '$INSTALL_PATH/debris/game'   && npm ci --silent && npm run build --silent
  cd '$INSTALL_PATH/debris/highscore-api' && npm ci --silent && npm run build --silent
"

echo
echo "=== Laying out the web root ==="
pct exec "$CTID" -- bash -c "
  set -e
  mkdir -p /usr/share/nginx/html
  cp -r '$INSTALL_PATH'/web/*      /usr/share/nginx/html/
  rm -rf /usr/share/nginx/html/hyperout
  cp -r '$INSTALL_PATH'/hyperout    /usr/share/nginx/html/hyperout
  mkdir -p /usr/share/nginx/html/godspeed /usr/share/nginx/html/debris
  cp -r '$INSTALL_PATH'/godspeed/game/dist/* /usr/share/nginx/html/godspeed/
  cp -r '$INSTALL_PATH'/debris/game/dist/*   /usr/share/nginx/html/debris/
  mkdir -p /var/lib/debris-highscore-api
  chown www-data:www-data /var/lib/debris-highscore-api
"

echo
echo "=== Writing the highscore API systemd unit ==="
SYSTEMD_UNIT_TMP="$(mktemp)"
cat > "$SYSTEMD_UNIT_TMP" <<EOF
[Unit]
Description=Debris high-score leaderboard API
After=network.target

[Service]
Environment=PORT=${API_PORT}
Environment=HIGHSCORE_FILE_PATH=/var/lib/debris-highscore-api/debris-highscores.json
ExecStart=/usr/bin/node ${INSTALL_PATH}/debris/highscore-api/dist/server.js
Restart=on-failure
User=www-data

[Install]
WantedBy=multi-user.target
EOF
pct push "$CTID" "$SYSTEMD_UNIT_TMP" /etc/systemd/system/debris-highscore-api.service
rm -f "$SYSTEMD_UNIT_TMP"

pct exec "$CTID" -- bash -c "
  set -e
  systemctl daemon-reload
  systemctl enable --now debris-highscore-api
"

echo
echo "=== Writing the nginx config ==="
NGINX_CONF_TMP="$(mktemp)"
cat > "$NGINX_CONF_TMP" <<EOF
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

    # Fixed loopback address on this same LXC - no k8s-style
    # resolver/variable-target dance needed, nginx resolves this
    # normally at startup.
    location /api/debris/ {
        rewrite ^/api/debris/(.*)\$ /\$1 break;
        proxy_pass http://127.0.0.1:${API_PORT};
        proxy_set_header Host \$host;
    }

    location / {
        try_files \$uri \$uri/ =404;
        add_header Cache-Control "no-cache";
    }

    error_page 404 /404.html;

    gzip            on;
    gzip_types      text/plain text/css application/javascript application/json image/svg+xml;
    gzip_min_length 512;

    location ~* \.(html|js|css|svg)\$ {
        add_header Cache-Control "no-cache";
    }
    location ~* \.(png|jpg|jpeg|ico|woff2?)\$ {
        expires 1h;
        add_header Cache-Control "public, max-age=3600, must-revalidate";
    }
    location ~* \.(mp3|wav)\$ {
        expires 7d;
        add_header Cache-Control "public, max-age=604800";
    }
}
EOF
pct push "$CTID" "$NGINX_CONF_TMP" /etc/nginx/sites-available/rheinarts
rm -f "$NGINX_CONF_TMP"

pct exec "$CTID" -- bash -c "
  set -e
  ln -sf /etc/nginx/sites-available/rheinarts /etc/nginx/sites-enabled/rheinarts
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl reload nginx
"

ACCESS_IP="${IP_CIDR%%/*}"
echo
echo "=== Done ==="
echo "Portal:  http://${ACCESS_IP}/"
echo "Debris:  http://${ACCESS_IP}/debris/"
echo "API:     http://${ACCESS_IP}/api/debris/highscores?mode=singlePlayer"
echo
if [[ "$ROOT_PASSWORD_WAS_SET" == "0" ]]; then
  echo "No root password was set - the Proxmox web console, 'pct console',"
  echo "and SSH won't accept a login yet. 'pct enter $CTID' from this host"
  echo "works regardless. To enable the others: pct exec $CTID -- passwd"
  echo
fi
echo "To update later: pct exec $CTID -- /opt/rheinarts/update-lxc.sh"
echo "(or 'pct enter $CTID' then run /opt/rheinarts/update-lxc.sh directly)."
