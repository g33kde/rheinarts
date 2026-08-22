# Gameplay

## Arena

- Single screen, no scrolling. All edges **wrap** (exit right, re-enter
  left; exit top, re-enter bottom) — applies to ships, asteroids, the UFO,
  and every projectile. This is the defining Asteroids mechanic; nothing
  in this game should treat the arena edges as walls.

## The ship

Three inputs, same for every player regardless of keyboard or gamepad (see
`docs/controls.md` for the actual key/button mapping):

- **Turn** (left/right) — rotates the ship in place. Does not move it.
- **Thrust** — accelerates the ship *in the direction it's currently
  facing*, adding to its existing velocity. There is no instant stop and
  no strafing: releasing thrust lets the ship coast, drifting in whatever
  direction it was last accelerating. This momentum is the core of
  Asteroids' feel and should not be simplified into "move forward/back."
  A small velocity cap keeps coasting from becoming unrecoverable.
- **Shoot** — fires a projectile straight out of the ship's nose, in the
  direction it's currently facing. **v1 starting values**: ~250ms cooldown
  between shots, max 4 of a player's own shots on screen at once — chosen
  as "Classic Asteroids" pacing (deliberate, every shot matters) over a
  faster spam-friendly rate or a slower aim-heavy one. Starting points to
  feel out once playable, not immutable.

A ship destroyed by an asteroid, a UFO, a UFO shot, or (in Competitive)
another player's shot or ship, costs it one life and respawns at an
arena-center-ish safe spot after a brief invulnerability window, same
general shape as Godspeed's respawn-with-grace-period pattern.

## Asteroids

- Spawn in a wave at the start of a round/level, drifting in a straight
  line at a fixed heading with a slow constant rotation — no steering, no
  targeting the player. Pure momentum, same as ships.
- Three sizes: **large → medium → small**. Shooting one splits it into two
  of the next size down; shooting (or ramming) a **small** asteroid
  destroys it for good.
- **Smaller is faster**: each size tier moves noticeably faster than the
  one above it, so splitting a slow, easy-to-read large rock creates two
  small ones that are the real dodge/reflex test. This is the primary
  in-wave difficulty curve, separate from the between-wave ramp below.
  **v1 starting value**: small ≈ 1.8–2x large's speed (medium
  interpolates between) — the "Classic ramp," a real escalation matching
  the original's threat curve, over a gentler or more brutal spread.
- **Split spread is randomized**: a child asteroid's heading is the
  parent's original heading plus a random angular offset (not aimed away
  from the shot, not perpendicular to it) — deliberately a little
  unpredictable, matching the source material rather than a "readable"
  reaction to where you hit it.
- **No rock-on-rock collision** — asteroids drift through each other's
  space untouched; only ships, shots, and the UFO interact with them.
  Keeps the physics simple (no pairwise checks, no clumping/pileup to
  design around) and matches the original.
- **Procedurally generated, not art assets**: each rock's shape is a
  randomized polygon (vertex count + per-vertex radius jitter) computed at
  spawn/split time, decided and confirmed against a live sample — see
  `docs/art_direction.md`. A wave reads as a varied field because every
  rock is actually unique, not because a fixed set of shapes is shuffled.
- A ship colliding with an asteroid of any size destroys the ship (see
  above) — the asteroid splits/destroys the same as if it'd been shot.
- Destroying an asteroid scores points, more for smaller pieces (they're
  harder to hit and, per the above, faster). **v1 starting values**:
  large=20, medium=50, small=100 — "Classic inverse-size" scoring,
  matching the original arcade's actual logic of rewarding precision on
  the hardest targets, over a flatter spread or bigger arbitrary numbers.
- A wave is cleared when every asteroid (at every size) is gone. Clearing
  a wave spawns the next one, larger/more numerous than the last — the
  primary *between-wave* difficulty ramp, deliberately simple rather than
  Godspeed's multi-system floor scaling.

## The UFO

One enemy type for v1 (see `docs/roadmap.md` for a possible second
variant later):

- Spawns periodically during a wave (not tied to asteroid count), enters
  from an edge, and drifts across the arena on a fixed heading — same
  wrap rules as everything else.
- Fires at a rough lead on the nearest player at a steady interval — aimed
  enough to be a real threat, not perfectly accurate (should be
  beatable/dodgeable, same spirit as HyperOut's deliberately-imperfect
  CPU).
- Destroying it is worth a meaningfully bigger score bonus than an
  asteroid — it's the skill-testing target, not filler. **v1 starting
  value**: 200+ points (same "Classic inverse-size" scoring decision as
  asteroids above; exact figure above 200 still open to feel out).
- The UFO can also be destroyed by, or collide with, asteroids — it isn't
  invulnerable to the environment it shares with the players.
- Visually: a red "Classic Saucer" (disc + dome + pulsing under-lights) —
  decided, see `docs/art_direction.md`.

## Power-ups (v1: Shield only)

- **Shield** — a pickup drifting in the arena; a ship that touches it
  gains one charge that **absorbs exactly one hit** (asteroid collision,
  UFO shot, or in Competitive another player's shot/ship) with no life
  lost and no respawn-flinch, then breaks. Same semantics as Godspeed's
  Shield pickup, deliberately reused rather than reinvented.
- **Single charge, non-stacking for v1**: a ship can hold at most one
  shield at a time. Touching a second Shield pickup while already
  holding a charge is a harmless no-op (not wasted, just capped) rather
  than stacking multiple hits of protection — Godspeed's own Shield
  stacks, but that's a different game with a different pickup cadence;
  this is the simplest version of the mechanic, not a port of that one.
  Revisit if v1 playtesting says one charge is a good, worth reconsidering
  before adding more power-up types (see `docs/roadmap.md`).
- **v1 starting value**: spawns roughly every 20–30s ("Moderate" cadence)
  — regularly enough to matter, not guaranteed to be there when you need
  it. How many at once / fixed spots vs. random position is still open,
  not fixed here.
- Visually: a rotating sapphire "Diamond Core" with a pulsing center —
  decided, see `docs/art_direction.md`.

## Modes

Both are selectable from a mode-select screen before a round starts —
neither is the "real" mode with the other bolted on.

### Cooperative

- All active players share the arena and fight the same wave of
  asteroids and UFOs together.
- **No friendly fire** — player shots and player ships pass through each
  other harmlessly.
- Each player has their **own** life count (not a shared pool) — one
  player running out doesn't end the round for the others; the round ends
  when every player is out of lives, or the current wave is cleared and
  players choose to stop.
- Score is shared/team-based: the point of co-op is clearing waves
  together, not competing for a personal high score.

### Competitive

- All active players share the arena; player ships and player shots **do**
  collide with each other — friendly fire is the point.
- Asteroids and any UFOs present are a shared hazard, not aligned with
  any player.
- **Last ship standing wins the round.** A player's own score is tracked
  and shown, but eliminations decide the round outcome, not score — avoids
  a race-to-a-number that can end anticlimactically while ships are still
  flying.
- Best-of-N round structure (same shape as HyperOut's match format) is a
  natural fit here but is a v1 nice-to-have, not required for the mode to
  work — see `docs/roadmap.md`.

## Lives & game over

- Each player starts a round with **3 lives** — standard arcade
  convention, chosen over a harsher 2 or a more forgiving 5.
- **Cooperative**: round ends when all active players are out of lives
  (loss) or a wave is cleared and the group chooses not to continue
  (win/stop).
- **Competitive**: round ends when only one ship remains (or, in a 1-life
  edge case with more eliminations than expected, whoever's left).
