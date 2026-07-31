# RHEIN ARTS

A retro synthwave **browser arcade** — a portal that hosts multiple games, starting
with **HyperOut**. Made im Düsseldorf. 🌆

Live (soon): [www.rheinarts.de](https://www.rheinarts.de)

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

## Run locally

No build step — it's static files. From the repo root:

```bash
python3 -m http.server 8000
```

- Portal: <http://localhost:8000/web/>
- Game only: <http://localhost:8000/hyperout/>

(`.claude/launch.json` also defines `site` and `hyperout` dev-server configs.)

## Project structure

```
rheinarts/
├── web/            # the arcade portal (index.html, style.css, img/, fonts/)
├── hyperout/       # the HyperOut game (index.html, game.js, style.css, assets/, music/)
├── Dockerfile      # nginx image: portal at /, game at /hyperout/
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
