# Testing the dedicated server on a real Linux box, from the internet

Everything so far has been verified on one Mac against `127.0.0.1`. This is
the first test over a real network: a Linux server at `debris.rheinarts.de`,
and clients on other networks. It takes about 30 minutes the first time.

Two machines are involved:

- **SERVER** - the Linux box (`debris.rheinarts.de`). You need a normal user
  with `sudo`, not root.
- **CLIENT** - your Mac or Windows PC, ideally on a *different network* from the
  server (phone hotspot is perfect - it is behind carrier NAT, the hardest case).

Use the branch **`debris-server-phase6`**: it contains every phase so far.

## 1. DNS and firewall (one time)

1. **DNS**: an `A` record `debris.rheinarts.de` -> the server's public IPv4.
   It must be **DNS only** (grey cloud in Cloudflare). Cloudflare's proxy and
   Tunnel carry HTTP, not WebRTC's UDP, and would also block port 8765.
   Check from the CLIENT: `dig +short debris.rheinarts.de` (or `nslookup`)
   prints the server's IP.
2. **Firewall** - open on the SERVER, *and* in your hosting provider's own
   firewall/security-group panel if it has one:

   | Port | Why |
   | --- | --- |
   | **TCP 8765** | signaling WebSocket (set `network.signalingPort` to change) |
   | **UDP 50000-50100** | the WebRTC game traffic (`network.udpPortRange`) |

   ```bash
   sudo ufw allow 8765/tcp
   sudo ufw allow 50000:50100/udp
   sudo ufw status
   ```
   If the server sits behind a router, forward the same ports to it (the UDP
   range 1:1, not remapped).

## 2. Install and build on the SERVER

```bash
# Libraries Electron needs, and a virtual display (the game runs in a hidden window)
sudo apt update
sudo apt install -y xvfb libnss3 libgtk-3-0 libgbm1 libasound2t64 libxss1 libxtst6 git curl tmux
#   (older Ubuntu/Debian: libasound2 instead of libasound2t64)

# Node 22 LTS - NOT a newer one: Electron's installer silently fails on Node 26.
node -v          # must print v22.x. If not:
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
exec $SHELL -l   # reload, then:
nvm install 22

git clone -b debris-server-phase6 https://github.com/g33kde/rheinarts.git
cd rheinarts/debris

# build the game the server runs
(cd game && npm ci && npm run build:desktop)

# the server itself
cd server
npm ci
ls node_modules/electron/path.txt     # must exist; if not, Node is the wrong version
```

## 3. (Optional) a throwaway high score API on the SERVER

To test score posting without touching production, run the real API locally on
the server. Skip this step to test everything else first.

```bash
cd ~/rheinarts/debris/highscore-api
npm ci && npm run build
mkdir -p ~/hs
KEY="$(openssl rand -hex 16)"; echo "key: $KEY"        # note it for the config below
tmux new -d -s api "PORT=8081 HIGHSCORE_FILE_PATH=$HOME/hs/h.json DEBRIS_SERVER_KEY=$KEY node dist/server.js"
curl -s localhost:8081/healthz                          # ok
```

## 4. Configure and start the server (SERVER)

```bash
cd ~/rheinarts/debris/server
cp config.example.json config.json
nano config.json
```

For this test set (the smoke scenarios depend on the two timings; use any password and pass it as `--password=<it>`):

```json
{
  "name": "Debris Test",
  "password": "choose-one",
  "gameplay": { "returnToLobbyDelayMs": 1000, "reconnectGraceMs": 3000 },
  "ops": {
    "logLevel": "debug",
    "highscoreApiUrl": "http://127.0.0.1:8081/highscores",
    "highscoreApiKey": "<the KEY from step 3>"
  }
}
```

(Leave `highscoreApiUrl` and `highscoreApiKey` both `null` if you skipped step 3 -
they must be set together or both null.) Everything else can stay as in the
example. The server refuses to start on an invalid config and lists every
problem at once.

```bash
tmux new -s debris
npm run start:linux           # Ctrl-b d to detach; `tmux attach -t debris` to return
```

You should see, within a few seconds:

```
INFO  WebRTC UDP ports pinned to 50000-50100
INFO  signaling listening on ws://0.0.0.0:8765
INFO  online scores will be posted to http://127.0.0.1:8081/highscores
INFO  game page loaded; lobby is opening
INFO  [game] Debris Test: lobby open, waiting for players
```

If it exits instead: the last line says why (a config problem, "game build not
found" -> redo `npm run build:desktop` in `game/`, or a port already in use).

### Keep it running: install as a service

Once the tests pass, stop the tmux run (Ctrl-C) and install the systemd
service so it starts at boot and restarts after a crash:

```bash
cd ~/rheinarts/debris/server
sudo ./deploy/install.sh
./deploy/debrisctl.sh logs        # Ctrl-C leaves the log view; the server keeps running
```

See "Run it as a service" in `README.md` (stop/restart/update). The tmux run
and the service use the same ports, so run only one.

## 5. Check reachability from the CLIENT

```bash
nc -vz debris.rheinarts.de 8765        # "succeeded" - TCP signaling is open
```
(Windows PowerShell: `Test-NetConnection debris.rheinarts.de -Port 8765`.)
UDP cannot be probed this way; the smoke test in the next step proves it.

## 6. Run the smoke scenarios from the CLIENT

On the CLIENT, with Node 22 and this branch checked out:

```bash
git clone -b debris-server-phase6 https://github.com/g33kde/rheinarts.git   # or `git pull` if you have it
cd rheinarts/debris/server && npm ci
```

Then, one after another (each prints `PASS` or a `FAIL:` line saying what broke):

```bash
URL=ws://debris.rheinarts.de:8765

npm run smoke -- --url=$URL --stun=1 --scenario=play --players=4 --password=choose-one --seconds=10
npm run smoke -- --url=$URL --stun=1 --scenario=lobby --password=choose-one
npm run smoke -- --url=$URL --stun=1 --scenario=session --password=choose-one
npm run smoke -- --url=$URL --stun=1 --scenario=scoring --password=choose-one    # can take a minute or two
```

- `play` is the real-network measurement: it prints, per player, the snapshot
  rate (should be ~30 Hz), the bandwidth in KB/s and tick regressions (should
  be 0).
- `lobby` and `session` cover the rules: leader, mode, rejects, two-player PC,
  reconnect, takeover, seat release.
- `scoring` earns a score and leaves. Check the board **on the SERVER**:
  ```bash
  curl -s 'localhost:8081/highscores?mode=onlineCooperative&version=2'
  # [{"initials":"SMK","score":20}]
  ```
  and `grep score` in the server's output: `score onlineCooperative SMK 20: posted`.

Run them from a network that is *not* the server's. (A phone hotspot would be a harder NAT case; we chose not to test it - see "Known limits" in `README.md`.)

## 7. Play it for real

On a PC (Mac or Windows) with Node 22 (the game's dependencies must be
installed once - `preview` builds the game but does not install them):

```bash
cd rheinarts/debris/game && npm ci
cd ../desktop && npm install && npm run preview
```
In the window: **MULTIPLAYER -> ONLINE**. It should show "Debris Test", players
0/4, "Password required". Type your initials (three letters), Tab, type
your password, **JOIN**, then **START**. Fly around. Then:

- Join from a **second machine** (or a second window) and check the leader
  gets START/MODE and the other waits.
- Kill the client's network for a few seconds mid-match (Wi-Fi off/on): the
  banner "CONNECTION LOST - RECONNECTING" appears and you are back in the same
  match.
- Let the match end: the end screen shows, then everyone is back in the lobby.

## 8. What to send back

1. The SERVER's output from startup to the end of the tests (the tmux scrollback:
   `tmux capture-pane -pS -3000 -t debris > ~/server-output.txt`).
2. The CLIENT's output of the four smoke runs, and which network each ran from.
3. While a match is running, on the SERVER:
   `sudo ss -ulnp | grep -E ':5[0-9]{4}'` (shows the UDP ports in use).
4. Anything that looked wrong when playing for real, even small (stutter,
   delay, a screen that confused you).

## When something fails

| Symptom | Likely cause |
| --- | --- |
| `signaling error - is the server running` / `Could not reach the server` | DNS wrong (not the server's IP, or still proxied), TCP 8765 blocked, or the server is not running |
| `no data channel after 30s` / `the game connection could not be established (is the UDP port range open?)` | UDP 50000-50100 blocked (firewall, provider panel, or router not forwarding it) |
| Connects, then drops after ~5-10 s | UDP is open one way only - check the provider's firewall rules, not just `ufw` |
| `FAIL ... slot 2 to be released after the grace period` | `reconnectGraceMs` is not 3000 in `config.json` |
| `FAIL ... joined or reject` after a password | `password` is not exactly your password |
| `score ... the API rejected the key` in the server output | `highscoreApiKey` does not match the API's `DEBRIS_SERVER_KEY` |
| `score ... the online boards are not enabled` | the API was started without `DEBRIS_SERVER_KEY` |
| Server exits at once: "invalid config" | the message lists each problem; unknown keys are errors |
| `npm ci` for the server: Electron "failed to install" | wrong Node version (needs 22), or `node_modules/electron/path.txt` missing |

## Afterwards

Put `returnToLobbyDelayMs` back to `8000` and `reconnectGraceMs` to `30000`
(the defaults), set a real password (or `""` for none), and point
`highscoreApiUrl` at the real API once it has the new image and key (see
`DEPLOYMENT.md`, "Online boards and the server key"). The server stops cleanly
on Ctrl-C / `SIGTERM`.
