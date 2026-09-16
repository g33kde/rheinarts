#!/usr/bin/env bash
# Rhein Arts — LXC update script. Run INSIDE the container, not on the
# Proxmox host - installed automatically at /opt/rheinarts/update-lxc.sh
# as part of the git clone install-lxc.sh already does (this file lives
# at the repo root, same as that script), so there's nothing separate
# to download or copy into place.
#
# Run as root inside the container:
#   /opt/rheinarts/update-lxc.sh
# Or from the Proxmox host, without entering the container:
#   pct exec <CTID> -- /opt/rheinarts/update-lxc.sh
#
# Pulls the latest code, rebuilds both games and the highscore API, and
# redeploys the static files + restarts the API service - the scripted
# equivalent of DEPLOYMENT-LXC.md's "Updating" section. Always rebuilds
# all three (no changed-files detection) - slower than strictly
# necessary on a no-op update, but simpler and can't miss an update by
# guessing wrong about what changed.
#
# Deliberately doesn't touch the nginx site config - that's generated
# once by install-lxc.sh at install time, not tracked by this repo. If
# DEPLOYMENT-LXC.md's own nginx config block changes upstream, that's a
# manual re-apply (see that doc), not something this script manages.

set -euo pipefail

readonly INSTALL_PATH="/opt/rheinarts"
readonly WEB_ROOT="/usr/share/nginx/html"

echo "=== Pulling latest ==="
cd "$INSTALL_PATH"
git pull

echo
echo "=== Rebuilding Godspeed ==="
cd "$INSTALL_PATH/godspeed/game"
npm ci --silent
npm run build --silent

echo
echo "=== Rebuilding Debris ==="
cd "$INSTALL_PATH/debris/game"
npm ci --silent
npm run build --silent

echo
echo "=== Rebuilding the highscore API ==="
cd "$INSTALL_PATH/debris/highscore-api"
npm ci --silent
npm run build --silent

echo
echo "=== Redeploying static files ==="
cp -r "$INSTALL_PATH"/web/*      "$WEB_ROOT"/
rm -rf "$WEB_ROOT/hyperout"
cp -r "$INSTALL_PATH/hyperout"    "$WEB_ROOT/hyperout"
cp -r "$INSTALL_PATH"/godspeed/game/dist/* "$WEB_ROOT/godspeed/"
cp -r "$INSTALL_PATH"/debris/game/dist/*   "$WEB_ROOT/debris/"

echo
echo "=== Restarting the highscore API ==="
systemctl restart debris-highscore-api
systemctl status debris-highscore-api --no-pager -l | head -5

echo
echo "=== Done ==="
echo "No nginx restart needed for the above - no-cache headers mean the"
echo "next request just picks up the new files. If nginx.conf itself"
echo "changed (rare, see DEPLOYMENT-LXC.md), that's a manual re-apply:"
echo "  nginx -t && systemctl reload nginx"
