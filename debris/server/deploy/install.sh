#!/usr/bin/env bash
# Installs the Debris server as a systemd service (Debian/Ubuntu).
#   sudo ./deploy/install.sh [--user=<account>] [--no-apt] [--no-firewall]
# Run from a checkout whose game and server are already built:
#   (cd ../game && npm ci && npm run build:desktop) && npm ci
# The service runs from this checkout, as --user (default: the user who ran sudo).
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_USER="${SUDO_USER:-}"
DO_APT=1
DO_FW=1
for arg in "$@"; do
  case "$arg" in
    --user=*) RUN_USER="${arg#--user=}" ;;
    --no-apt) DO_APT=0 ;;
    --no-firewall) DO_FW=0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

[ "$(id -u)" -eq 0 ] || { echo "run with sudo" >&2; exit 1; }
[ -n "$RUN_USER" ] && [ "$RUN_USER" != root ] || { echo "pass --user=<a normal account>; running the game server as root is not worth the risk" >&2; exit 1; }
id "$RUN_USER" >/dev/null 2>&1 || { echo "no such user: $RUN_USER" >&2; exit 1; }
RUN_HOME="$(getent passwd "$RUN_USER" | cut -d: -f6)"

# The user's Node (it may live under nvm), which must be 22.
NODE_BIN="$(sudo -u "$RUN_USER" -H bash -lc 'command -v node' || true)"
[ -n "$NODE_BIN" ] || { echo "$RUN_USER has no node on PATH - install Node 22 (see TESTING-LINUX.md)" >&2; exit 1; }
case "$("$NODE_BIN" -v)" in
  v22.*) ;;
  *) echo "Node is $("$NODE_BIN" -v), need v22 (Electron's installer fails silently on newer ones)" >&2; exit 1 ;;
esac
NODE_DIR="$(dirname "$NODE_BIN")"

[ -f "$DIR/node_modules/electron/path.txt" ] || { echo "run 'npm ci' in $DIR first (node_modules/electron/path.txt missing)" >&2; exit 1; }
[ -f "$DIR/../game/dist-desktop/index.html" ] || { echo "game not built: (cd $DIR/../game && npm ci && npm run build:desktop)" >&2; exit 1; }
if [ ! -f "$DIR/config.json" ]; then
  cp "$DIR/config.example.json" "$DIR/config.json"
  chown "$RUN_USER" "$DIR/config.json"
  chmod 600 "$DIR/config.json"   # holds the password and the score API key
  echo "created config.json from the example - edit it (password, name, score API)"
fi
sudo -u "$RUN_USER" "$NODE_BIN" "$DIR/tools/check-config.js" "$DIR/config.json"

if [ "$DO_APT" -eq 1 ] && command -v apt-get >/dev/null; then
  ASOUND=libasound2t64; apt-cache show libasound2t64 >/dev/null 2>&1 || ASOUND=libasound2
  apt-get install -y xvfb libnss3 libgtk-3-0 libgbm1 "$ASOUND" libxss1 libxtst6
fi
[ -x /usr/bin/xvfb-run ] || { echo "xvfb-run missing (apt install xvfb)" >&2; exit 1; }

NAME="$(basename "$(dirname "$DIR")")"
sed -e "s|@NAME@|$NAME|g" -e "s|@USER@|$RUN_USER|g" -e "s|@DIR@|$DIR|g" \
    -e "s|@NODE_DIR@|$NODE_DIR|g" -e "s|@HOME@|$RUN_HOME|g" -e "s|@CONFIG@|$DIR/config.json|g" \
    "$DIR/deploy/debris-server.service.in" > /etc/systemd/system/debris-server.service

if [ "$DO_FW" -eq 1 ] && command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  PORTS="$(sudo -u "$RUN_USER" "$NODE_BIN" "$DIR/tools/check-config.js" "$DIR/config.json" --ports)"
  SIG="${PORTS%% *}"; UDP="${PORTS##* }"
  ufw allow "$SIG/tcp"
  ufw allow "${UDP/-/:}/udp"
fi

systemctl daemon-reload
systemctl enable --now debris-server
sleep 3
systemctl --no-pager status debris-server | head -12 || true
echo
echo "Installed. Manage it with: $DIR/deploy/debrisctl.sh {start|stop|restart|status|logs|check}"
echo "Also open the same ports in your hosting provider's own firewall panel, if it has one."
