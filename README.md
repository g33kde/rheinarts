# RHEIN ARTS

A retro synthwave **browser arcade** — a portal that hosts multiple games:
**HyperOut**, **Godspeed**, and **Debris**. Made in Düsseldorf. 🌆

Live (if k8s cluster is up): [www.rheinarts.de](https://www.rheinarts.de)

---

## Games

### HyperOut — Tron-style light-cycle racer
Two light cycles, one grid. Leave a trail, don't crash into walls or trails, last
rider standing wins the round. Best-of-N match.

**Controls**

| | Turn | Boost |
|---|---|---|
| Player 1 (cyan) | `W A S D` | `Left Shift` |
| Player 2 (orange) | `← ↑ ↓ →` | `Right Shift` |

- **Boost** — 3 charges per round; while boosting you go 2× speed and *phase through
  trails* (but leave no wall). Time it to escape a trap.
- **Modes** — 2 players, or 1 player vs a space-filling CPU.
- **Options** — first-to-N rounds, optional shrinking arena.
- `Esc` pause · `M` mute music · `F` fullscreen.

### Godspeed — maze shooter roguelite (beta)

A cooperative roguelite maze shooter, on the portal marked `BETA` - single-player
only so far, roster and floor progression still growing. See
[`godspeed/`](godspeed/) for the game's own docs, roadmap, and changelog.
Unlike HyperOut it's a Vite/TypeScript build, not static files - see below.

### Debris — Asteroids clone for 1-4 players

Drift-and-shoot arcade action: split rocks, dodge the UFO's lead-aimed shots,
grab the Shield pickup. Keyboard for P1/P2 today (gamepad and P3/P4 still
in progress). See [`debris/`](debris/) for the game's own docs, roadmap, and
changelog. Also a Vite/TypeScript build, same as Godspeed.

## Run locally

HyperOut and the portal are static files, no build step. Godspeed and Debris
each need `npm install`/`npm run dev` - see
[`godspeed/README.md`](godspeed/README.md) and
[`debris/README.md`](debris/README.md). From the repo root, for the static
parts:

```bash
python3 -m http.server 8000
```

- Portal: <http://localhost:8000/web/>
- Game only: <http://localhost:8000/hyperout/>

(`.claude/launch.json` also defines `site`, `hyperout`, `godspeed`, and
`debris` dev-server configs.)

## Project structure

```
rheinarts/
├── web/            # the arcade portal (index.html, style.css, img/, fonts/)
├── hyperout/       # the HyperOut game (index.html, game.js, style.css, assets/, music/)
├── godspeed/       # the Godspeed game (Vite/TypeScript, see godspeed/README.md)
├── debris/         # the Debris game (Vite/TypeScript, see debris/README.md)
├── Dockerfile      # nginx image: portal at /, HyperOut at /hyperout/, Godspeed at /godspeed/, Debris at /debris/
├── nginx.conf
├── k8s/            # Kubernetes manifests (k3s + MetalLB)
├── DEPLOYMENT.md   # build → push → deploy runbook
└── ROADMAP.md      # planned improvements
```

## Deploy

Runs as a single nginx image on Kubernetes (k3s + MetalLB). See
[DEPLOYMENT.md](DEPLOYMENT.md) for the full build → push (GHCR) → `kubectl apply`
runbook.

## Roadmap

Planned features and improvements live in [ROADMAP.md](ROADMAP.md).

## License

Source code is [MIT](LICENSE). The logos, artwork, music and sound effects are
© 2026 Rhein Arts, all rights reserved (see the note in `LICENSE`).
