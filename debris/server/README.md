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
| `gameplay.returnToLobbyDelayMs` | in use - how long the end screen shows before the lobby reopens |

### Firewall

Open **TCP** `network.signalingPort` (default 8765) and **UDP**
`network.udpPortRange` (default 50000-50100). If `debris.rheinarts.de`
fronts this server it must be a plain DNS record - Cloudflare's proxy and
Tunnel carry HTTP only, not WebRTC's UDP.

## Test it

```bash
npm test                                   # config + signaling unit tests (node --test)
npm start                                  # in one terminal
npm run smoke -- --players=4               # in another: join 4, leader starts, snapshots + input checked
npm run smoke -- --scenario=lobby          # the lobby rules end to end (~30 s)
npm run smoke -- --url=ws://host:8765 --stun=1   # against a remote server
```

The smoke client (`tools/`) is a plain-JS implementation of the client wire
protocol, deliberately independent of the game's own client code. Exit code
0 = PASS. `--scenario=play` (default) joins N players, has the leader
(optionally `--mode=competitive`) start, then checks welcome, distinct
slots, snapshot rate, monotonic ticks and that ships respond to input.
`--scenario=lobby` walks the rules: a non-leader's commands are ignored,
leadership passes when the leader leaves, Competitive refuses to start
alone, input claiming someone else's slot is not honoured, a mid-match
joiner is rejected, and the lobby reopens (and resets) after the match.
It needs `gameplay.returnToLobbyDelayMs` small (e.g. 1000) to be quick.

## The lobby

One match at a time. The **first player to join is the leader**; if they
leave, leadership passes to the earliest remaining joiner. Only the leader
can start the match or switch Cooperative/Competitive, and only while the
lobby is gathering. Competitive needs at least two players (a lone survivor
"wins" instantly). Joiners during a match get a `debris-reject`
(`matchInProgress`), a full lobby gets `full`. When a match ends the end
screen shows for `returnToLobbyDelayMs`, everyone still connected stays
seated, and the lobby reopens. An emptied lobby resets to
`gameplay.defaultMode`.

Who is allowed to do what is decided by `game/src/systems/DedicatedLobby.ts`
(pure, unit-tested); `DedicatedServer.ts` feeds it real connections. Every
message a client sends - lobby commands and ship input - is attributed to
the slot its *connection* was seated in. A `slotIndex` inside a message is
ignored, so a client cannot drive another player's ship or issue the
leader's commands.

## Known limits

- No password check, no client lobby UI, no reconnect window, no score
  submission (phases 5 and 6). The existing game client cannot join yet.
- A leader who joins and goes idle blocks everyone from starting. There is
  no idle-leader timeout yet (phase 8).
- A player whose connection is *cut* (not closed) is only noticed after
  ICE's keep-alive timeout, several seconds. A deliberate leave is seen
  immediately.
- A signaling socket that closes mid-handshake leaves its half-open
  `RtcConnection` in `RtcSignalingHost.pending` (phase 8 cleanup).
- No rate limiting or password check yet (phases 5 and 8).

## Node version

Electron's installer misbehaves silently under very new Node releases (we
saw `node_modules/electron/path.txt` never get written on Node 26). Use
Node 20 or 22 for `npm install`. Newer npm also blocks install scripts
unless approved; `package.json`'s `allowScripts` entry approves Electron's.
