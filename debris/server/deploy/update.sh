#!/usr/bin/env bash
# Updates the installed Debris server to the latest commit and restarts it.
#   sudo ./deploy/update.sh [--branch=<name>] [--no-restart]
# Run as root (or with sudo). Everything except the restart runs as the account that owns
# the checkout, so no root-owned files end up in it. Only rebuilds what changed.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"
BRANCH=""
RESTART=1
for arg in "$@"; do
  case "$arg" in
    --branch=*) BRANCH="${arg#--branch=}" ;;
    --no-restart) RESTART=0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

[ "$(id -u)" -eq 0 ] || { echo "run with sudo (or as root)" >&2; exit 1; }
RUN_USER="$(stat -c %U "$DIR")"
[ "$RUN_USER" != root ] || { echo "$DIR is owned by root; the checkout should belong to the service account" >&2; exit 1; }

# Run a command as the service account with its nvm Node 22 first on PATH.
as_user() {
  sudo -u "$RUN_USER" -H bash -c 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1 && nvm use 22 >/dev/null 2>&1; cd "$1" && shift && eval "$@"' _ "$@"
}
case "$(as_user "$ROOT" 'node -v' || true)" in
  v22.*) ;;
  *) echo "$RUN_USER has no Node 22 (got: $(as_user "$ROOT" 'node -v' 2>&1 || true))" >&2; exit 1 ;;
esac

OLD="$(as_user "$ROOT" 'git rev-parse HEAD')"
[ -z "$BRANCH" ] || as_user "$ROOT" "git fetch origin && git checkout $BRANCH"
as_user "$ROOT" 'git pull --ff-only'
NEW="$(as_user "$ROOT" 'git rev-parse HEAD')"
CHANGED="$(as_user "$ROOT" "git diff --name-only $OLD $NEW")"
as_user "$ROOT" 'git log --oneline -1'

if [ "$OLD" = "$NEW" ] && [ -f "$ROOT/game/dist-desktop/index.html" ]; then
  echo "already up to date"
else
  echo "$CHANGED" | grep -q '^debris/game/package-lock.json' && as_user "$ROOT/game" 'npm ci'
  echo "$CHANGED" | grep -q '^debris/server/package-lock.json' && as_user "$DIR" 'npm ci'
  as_user "$ROOT/game" 'npm run build:desktop'
fi
as_user "$DIR" 'node tools/check-config.js config.json'

[ "$RESTART" -eq 1 ] || { echo "updated; not restarted (--no-restart)"; exit 0; }
systemctl restart debris-server
sleep 4
systemctl --no-pager status debris-server | head -5
journalctl -u debris-server --no-pager -n 40 | grep -E "lobby is opening|lobby open|ERROR|invalid config" | tail -3 || true
