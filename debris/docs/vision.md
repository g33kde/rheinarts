# Vision

## Elevator Pitch

**Debris** is a browser-first Asteroids clone for 1–4 players, built
around surviving a drifting field of rock and wreckage together: turn,
thrust, and shoot your way through it as a crew — get hit and you eject,
not die outright, and a teammate has to actually come get you before
your ship's gone for good. That rescue is the game's main hook.
Competitive (last ship standing) and a solo Single Player mode are both
fully built and first-class in their own right, for when a team isn't
who's in the room — but Cooperative is the mode Debris is designed
around.

## Pillars

- **Browser-first.** No install, runs in the browser like HyperOut and
  Godspeed.
- **Instant local multiplayer.** Up to 4 players in one browser tab —
  keyboard covers the first two, gamepads bring in the third and fourth.
  No lobby, no netcode: plug in a controller and press a button.
- **Classic arcade physics.** Momentum-based ship movement (thrust adds
  velocity, there's no instant stop), screen-wrap arena, asteroids that
  split when shot — the actual feel of 1979 Asteroids, not a reskin of a
  different movement model.
- **Fast rounds.** Sessions measured in minutes, not the 5–15 minute runs
  Godspeed targets — this is a pick-up-and-play arcade cabinet game, closer
  to HyperOut's pacing.
- **Cooperative is the main driver.** Getting hit ejects you, not kills
  you — a teammate has to reach you and fly you to the station before
  your ship's gone for good ("Emergency Ejection & Rescue,"
  `docs/gameplay.md`). That rescue tension is the thing Debris is
  actually about, not a generic "shoot rocks together." Competitive
  (last ship standing) and Single Player (solo, personal high score) are
  both fully built and not afterthoughts, but neither carries a
  mechanic as distinctive as Cooperative's own.
- **Shared visual identity.** Rhein Arts' synthwave/CRT look, so Debris
  reads as the same arcade as HyperOut and Godspeed, not a separate site.
- **Open source.**

## What this is not (v1)

- Not procedural/roguelite (that's Godspeed's territory) — one arena, one
  escalating wave structure.
- Not narrative or lore-driven — Asteroids doesn't need a story, and
  neither does this.
- Not online multiplayer — local input only for v1 (see `docs/roadmap.md`).

## Working title

"Debris" is both the folder name and the working game title — space debris
you're both fighting through and adding to. Revisit if a better name shows
up during development; nothing downstream depends on the name yet.
