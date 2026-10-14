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
| `name`, `motd` | in use - shown on the client's Online screen and lobby |
| `password` | in use - empty = none; checked at join (constant-time compare). Sent over the plain `ws://` signaling channel, so it is only as private as that path |
| `gameplay.returnToLobbyDelayMs` | in use - how long the end screen shows before the lobby reopens |
| `gameplay.reconnectGraceMs` | in use - how long a mid-match drop keeps its seat (default 30000; 0 = eliminated at once) |
| `ops.highscoreApiUrl`, `ops.highscoreApiKey` | in use - where online results are posted and the key that lets the server write the online boards (both or neither) |

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
npm run smoke -- --scenario=session --password=secret   # join checks, reconnect, two-player PC (needs the config below)
npm run smoke -- --scenario=scoring [--api=http://host:8081/highscores]   # earns a score; with --api, checks the board
npm run smoke -- --scenario=leave --password=<it>     # a deliberate leave frees the seat at once; a drop holds it
npm run e2e                                # the REAL game client, clicking through the Online screens
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
`--scenario=session` needs `"password": "secret"`, `reconnectGraceMs` 3000
and `returnToLobbyDelayMs` ~1000: it covers the status query, bad joins (no
password, wrong password, old version, malformed, three local players), a
two-player PC, a full lobby, input bound to the sender's own slots,
reconnect inside the window, a takeover by a quick reconnect, and a seat
released when the window closes.

`npm run e2e` (`tools/client-e2e-main.js`) loads the **built game client**
(`game/dist-desktop`, with `?e2e` so it exposes its Phaser instance) in a
hidden window and drives the real Online screens against a running server
that has the same password/grace/delay config: status panel, a refused join,
two local players, the lobby, START, a forced connection drop and the
reconnect banner, and a Competitive match against a bot that leaves, ending
with the survivor back in the same lobby. Run `npm run build-game` first.

## The lobby

One match at a time. The **first PC to join is the leader**; if it leaves,
leadership passes to the earliest remaining joiner. Only the leader can
start the match or switch Cooperative/Competitive, and only while the lobby
is gathering. Competitive needs at least two *players* (a lone survivor
"wins" instantly; two players on one PC count as two). When a match ends the
end screen shows for `returnToLobbyDelayMs`, everyone still connected stays
seated, and the lobby reopens. An emptied lobby resets to
`gameplay.defaultMode`.

**Joining.** Nobody is seated until they send a `debris-join` on the
reliable channel: protocol version, password, how many players are on this
PC (1 or 2) and optionally a reconnect token. The server answers
`debris-joined` (slots, token, mode, server name, MOTD) or
`debris-reject` with a reason: `full`, `matchInProgress`, `badPassword`,
`wrongVersion` or `badRequest`. A PC with two players takes two slots,
all-or-nothing. A connection that has not joined within 10 s is dropped.

**Reconnect window.** A player who drops *mid-match* keeps their seat for
`gameplay.reconnectGraceMs`: their ship goes inert and untouchable (a
"ghost", shown as RECONNECTING in the lobby), and a join carrying their
token within the window takes it all back - even from a connection the
server has not yet noticed is dead. When the window closes, or the match
ends, the seat is released. Outside a match a drop simply leaves. The
client (`OnlineClientSession`) retries on its own for as long as the server
promised to hold the seat.

**Status.** The Online screen asks the server who is on over the signaling
WebSocket alone - no WebRTC - and the *main process* answers from the last
status the game page reported, plus name, MOTD and whether a password is
needed.

Who is allowed to do what is decided by `game/src/systems/DedicatedLobby.ts`
(pure, unit-tested); `DedicatedServer.ts` feeds it real connections. Every
message a client sends is attributed to the seat its *connection* was given:
lobby commands to its owner, and an input message is applied only if the
slot it names is one of that connection's own. A client cannot drive another
player's ship or issue the leader's commands.

Every connection the server accepts is closed when its player leaves. (It
used to be left open, which kept a UDP port from the pinned range and kept
probing a dead address for every player who ever left.)

## Online high scores

When a match ends, the server posts the result to the high score API
(`ops.highscoreApiUrl`, with `ops.highscoreApiKey` as `X-Debris-Server-Key`).
The main process does it - the key never reaches the game page - and it never
holds up the lobby: a failed post is retried with a growing delay (4 tries),
then dropped with a log line. Nothing is queued across restarts; this is a
leaderboard, not a ledger. With the URL/key unset the server just logs what it
would have posted.

- **Why the server**: a match is simulated here, so its result is not
  something a client can make up. The API has two boards that only accept
  writes with the key - `onlineCooperative` and `onlineCompetitive` - separate
  from the three local boards (which stay open to any client, as before).
  Reading is public.
- **Who gets credited**: players give three-letter initials when they join (the
  Online screen remembers them; one set per player on the PC). *Competitive*:
  the winner's own score, to the winner; a draw earns nothing. *Cooperative*:
  the team's pooled score, to the last player to fall - the same rule a local
  game uses for who types the initials - or the first participant with
  initials if that player has none on record. A score of 0 is never posted.
- **The API must be deployed with the key**: `DEBRIS_SERVER_KEY` set on the
  API. Without it the online boards answer `403` (never open). See
  `../../DEPLOYMENT.md`, "Online boards and the server key".
- The log says what happened: `score onlineCooperative SMK 20: posted`, `... did
  not make the board`, `... the API rejected the key`, `... the online boards are
  not enabled`, `... giving up after 4 attempts`. The key is never logged.
- Not built: the game client does not show the online boards yet (they are
  readable at `GET /highscores?mode=onlineCooperative&version=2`).

## Running more than one Electron process on a machine

Electron processes that share the default profile directory interfere with
each other's networking. We saw it as a client's WebRTC connection dropping
the instant a second process (a test bot) was active, which looked exactly
like a game bug. Give each process its own: `--user-data-dir=<dir>`. The
smoke and e2e tools do this themselves; if you run two servers on one
machine, do it for the second.

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

- The roadmap's ops work - systemd unit, install script - is phase 7; rate
  limiting and an idle-leader timeout are phase 8. A first real-network test
  guide is in `TESTING-LINUX.md`.
- A leader who joins and goes idle blocks everyone from starting.
- A player whose connection is *cut* (not closed) is only noticed after
  ICE's keep-alive timeout, several seconds. A deliberate leave is seen at
  once. (A dropped mid-match player keeps a ghost ship for the grace period
  either way; a ghost that was in the shop holds up the stage vote until the
  seat is released.)
- A signaling socket that closes mid-handshake leaves its half-open
  `RtcConnection` in `RtcSignalingHost.pending` (phase 8 cleanup).
- Online play is desktop-only for now (the MULTIPLAYER menu entry is hidden
  in a plain browser tab), although nothing in the Online flow needs Node.
- Verified on macOS against `127.0.0.1` only - not yet on the Linux server
  or across the internet (`TESTING-LINUX.md` is how to do that).

## Node version

Electron's installer misbehaves silently under very new Node releases (we
saw `node_modules/electron/path.txt` never get written on Node 26). Use
Node 20 or 22 for `npm install`. Newer npm also blocks install scripts
unless approved; `package.json`'s `allowScripts` entry approves Electron's.
