#!/bin/sh
# Runs automatically before nginx starts (nginx:alpine's own entrypoint
# executes every script in /docker-entrypoint.d/). Substitutes
# nginx.conf's __COREDNS_IP__ placeholder with the real nameserver IP
# Kubernetes already writes into this pod's /etc/resolv.conf - see that
# file's `resolver` directive comment for why a real IP is needed here
# instead of a hostname.
set -eu

nameserver="$(awk '/^nameserver/ { print $2; exit }' /etc/resolv.conf)"

# A syntactically-valid but almost certainly-wrong fallback IP, not the
# raw placeholder - nginx's `resolver` directive needs *some* valid IP to
# accept at startup regardless of whether /etc/resolv.conf had one. A
# leftover __COREDNS_IP__ string would itself fail to parse as a
# resolver address and crash nginx on startup - exactly the failure mode
# this whole script exists to prevent. Worst case with this fallback:
# /api/debris/ can't resolve its upstream and returns 502 per-request,
# same "gracefully degrades, doesn't crash-loop the portal" behavior as
# before - never a nginx startup failure.
if [ -z "$nameserver" ]; then
  echo "resolve-coredns.sh: no nameserver found in /etc/resolv.conf - falling back to a placeholder IP, /api/debris/ will 502 until this is investigated" >&2
  nameserver="0.0.0.0"
fi

sed -i "s/__COREDNS_IP__/${nameserver}/" /etc/nginx/conf.d/default.conf
