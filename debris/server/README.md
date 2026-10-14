# Debris dedicated server

The unchanged game running **headless** inside Electron, reachable over
WebSocket signaling + WebRTC data channels. Players on the internet join it
from the client's ONLINE screen. Plan and status: `../docs/roadmap.md`
("Windows + LAN multiplayer") and `../CHANGELOG.md`.

How it fits together:

- `src/main.js` - Electron main process. Owns what a page can't: the config
  file, the WebSocket signaling endpoint (`src/signaling.js`), logging, and
  the process lifecycle. Exits non-zero on any startup failure.
- A hidden window loads the game's `build:desktop` output with `?server=1`.
  `game/src/main.ts` then boots Phaser `HEADLESS` (no audio, timer-driven
  frames) into `DedicatedServerScene` instead of the splash screen.
- `src/preload.js` bridges the two (`window.debrisServer`), the same shape of
  bridge `desktop/preload.js` is for a desktop client.
- Chromium provides WebRTC natively, so there is no separate WebRTC library.
  The UDP ports it uses are pinned to `network.udpPortRange`.

## Run it

```bash
npm install            # Node 20/22 LTS recommended - see "Node version" below
npm run build-game     # builds ../game into ../game/dist-desktop
cp config.example.json config.json   # then edit
npm start              # macOS/Windows, or a Linux desktop
npm run start:linux    # headless Linux: wraps electron in xvfb-run, --no-sandbox
```

`--config=<path>` selects another file; `--game=<index.html>` another game
build. With no `config.json` the server runs on built-in defaults.
`SIGTERM`/`SIGINT` shut it down cleanly.

### Config

See `config.example.json`; every key is validated (`src/config.js`) and
**unknown keys are an error**, so a typo can't silently fall back to a
default. All problems are reported at once. Not every key is acted on yet:

| Key | Status |
| --- | --- |
| `network.*`, `gameplay.*`, `ops.logLevel/logFile/snapshotHz` | in use |
| `name` | logged; shown on the Online screen from phase 5 |
| `motd`, `password` | phase 5 |
| `ops.highscoreApi*` | phase 6 |
| `dev.autoStartDelayMs` | **temporary** - the match starts this long after the first player joins, until phase 4's lobby leader replaces it |

### Firewall

Open **TCP** `network.signalingPort` (default 8765) and **UDP**
`network.udpPortRange` (default 50000-50100). If `debris.rheinarts.de`
fronts this server it must be a plain DNS record - Cloudflare's proxy and
Tunnel carry HTTP only, not WebRTC's UDP.

## Test it

```bash
npm test                                   # config + signaling unit tests (node --test)
npm start                                  # in one terminal
npm run smoke -- --players=4               # in another: full end-to-end check
npm run smoke -- --url=ws://host:8765 --stun=1   # against a remote server
```

The smoke client (`tools/`) is a plain-JS implementation of the client wire
protocol, deliberately independent of the game's own client code. It joins
N players, waits for the match to start, then checks: welcome received,
distinct slots, snapshots arriving at a sane rate, ticks monotonic, and the
ship actually responding to the input it sends. Exit code 0 = PASS.

## Known limits (phase 3)

- One lobby that auto-starts; no leader, no mode choice, no return to the
  lobby after game over (phase 4).
- A connection arriving after the match has started would still get a slot and a
  welcome (the lobby's connection handler outlives its scene - by reading the
  code, not yet exercised by a test). Phase 4 must
  reject these.
- A signaling socket that closes mid-handshake leaves its half-open
  `RtcConnection` in `RtcSignalingHost.pending` (phase 8 cleanup).
- No rate limiting or password check yet (phases 5 and 8).

## Node version

Electron's installer misbehaves silently under very new Node releases (we
saw `node_modules/electron/path.txt` never get written on Node 26). Use
Node 20 or 22 for `npm install`. Newer npm also blocks install scripts
unless approved; `package.json`'s `allowScripts` entry approves Electron's.
