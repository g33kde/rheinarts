#!/usr/bin/env bash
# Start / stop / inspect the installed Debris server service.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SVC=debris-server
sc() { if [ "$(id -u)" -eq 0 ]; then systemctl "$@"; else sudo systemctl "$@"; fi; }
case "${1:-}" in
  start|stop|restart) sc "$1" "$SVC"; sc --no-pager status "$SVC" | head -5 ;;
  status) sc --no-pager status "$SVC" ;;
  logs) shift; if [ "${1:-}" = "-f" ]; then journalctl -u "$SVC" --no-pager -n 50 -f; else journalctl -u "$SVC" --no-pager -n "${1:-100}"; fi ;;
  check) node "$DIR/tools/check-config.js" "$DIR/config.json" ;;   # validate config.json without starting
  *) echo "usage: $0 {start|stop|restart|status|logs [lines|-f]|check}" >&2; exit 2 ;;
esac
