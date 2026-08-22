# Debris

**Debris** is a browser-first, 1–4 player Asteroids clone: ships tumbling
through a drifting field of rock and wreckage, playable solo or with
friends, cooperatively or head-to-head.

Part of the [Rhein Arts](../README.md) arcade, alongside HyperOut and
Godspeed. This project is in the **scoping/design stage** — no code yet.
See `docs/` for the design docs, starting with `docs/vision.md`.

---

# Vision

> **Debris is a fast, local-multiplayer Asteroids clone — thrust, turn,
> shoot, survive the drift, playable with friends on one keyboard and up
> to two extra gamepads.**

The initial release (v1) targets:

* Browser (matching the rest of the Rhein Arts stack)
* 1–4 players: keyboard for players 1–2, gamepad required for players 3–4
* Classic ship control: turn, thrust, shoot, momentum-based movement
* Screen-wrap arena
* Asteroids that split when shot (large → medium → small)
* One UFO enemy
* Two selectable modes: **Cooperative** and **Competitive**
* Rhein Arts' synthwave/CRT visual identity (shared with HyperOut)

See `docs/roadmap.md` for what's explicitly deferred past v1.

---

# Repository Structure (planned)

```text
docs/           Design docs (this is where we are right now)
src/            Game source (not started)
assets/         Art, music, UI (not started)
```

---

# Documentation

The `docs/` directory is the source of truth for what this game is, before
any of it is code:

* `docs/vision.md` — elevator pitch and pillars
* `docs/gameplay.md` — ship control, asteroids, UFO, modes, lives/scoring
* `docs/controls.md` — keyboard and gamepad mapping
* `docs/art_direction.md` — visual identity
* `docs/roadmap.md` — v1 scope checklist and deferred ideas

Read `docs/vision.md` first.
