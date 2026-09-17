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
  A small `+<points>` number pops up where the hit landed, in the
  scoring player's own HUD color, then drifts/fades away — same feedback
  on a UFO kill (below). Sized deliberately small, on request — see
  `docs/art_direction.md`'s note on why it's scaled to the smallest rock.
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
  UFO shot, a Gravity Well's lethal center, or in Competitive another
  player's shot/ship) with no life lost and no respawn-flinch, then
  breaks. Same semantics as Godspeed's Shield pickup, deliberately reused
  rather than reinvented.
- **Stacks up to 2 charges** (`SHIELD.maxCharges`, requested directly after
  v1 shipped as single-charge) — a ship can hold up to two hits of
  protection at once, consumed one at a time. Touching a third pickup
  while already at the cap is a harmless no-op (not wasted, just capped),
  same courtesy the original single-charge version had at 1. Visually,
  the first charge is the original static sapphire ring, unchanged; a
  second charge adds a pulsing outer ring (`entities/Ship.ts`'s `draw()`)
  that breathes independently — reviewed live as an artifact mockup
  (a rotating-dashed-ring alternative was also built and compared) before
  implementation — so the charge count reads at a glance with no new HUD
  element, same "the visual is the only tell" rule the respawn-invulnerability
  flicker already follows.
- **v1 starting value**: spawns roughly every 20–30s ("Moderate" cadence)
  — regularly enough to matter, not guaranteed to be there when you need
  it. How many at once / fixed spots vs. random position is still open,
  not fixed here.
- Visually: a rotating sapphire "Diamond Core" with a pulsing center —
  decided, see `docs/art_direction.md`.

## Gravity Well

A periodic, fixed-position black hole — mode-agnostic, unlike the
Commander/Space Station rescue mechanic (Cooperative-only, see below).
Requested directly, connects to (and implements) the "Gravity anomalies"
hazard the speculative Chaos Meter idea in `docs/roadmap.md` already
sketched, built now as its own standalone hazard rather than gated
behind that unbuilt system.

Three concentric zones, all centered on wherever it spawns:

- **Gravity field** (outer) — pulls ships, asteroids, the UFO, Shield
  pickups, and adrift Commanders toward center. A real force, not an
  override: **escapable with sustained thrust**, weaker the further out
  you are. Decided explicitly: this reaches **the whole screen**, not
  just a local radius around the hole — wherever you are on screen, you
  feel *some* pull, it just fades the farther away you are, strongest
  right at the event horizon's edge.
- **Event horizon** (inner) — cross this and thrust stops mattering.
  From here on, whatever's caught is dragged straight toward center,
  faster the closer it gets, with **no way back out** — decided
  explicitly: this isn't a stronger pull to fight, it's a point of no
  return.
- **Lethal center** — a tiny area at the very middle. This is the only
  part that actually destroys anything; everything from the event
  horizon inward *to* this point is inescapable positioning, not damage
  by itself. A ship's Shield still absorbs it like any other hit - the
  shield's discharge blows the ship back out just past the event
  horizon, with a brief invulnerability window so it can't be
  immediately recaptured.

**Applies to everything, decided** - not just ships. An asteroid pulled
into the lethal center is destroyed outright (no split, unlike a shot -
consumed whole, not shattered), no score. The UFO is destroyed the same
"hazard, not a shot" way ships/asteroids already kill it - no score. A
Shield pickup caught by it is simply gone. An adrift Commander
(Cooperative) caught by it counts as a hazard kill, same permanence as
an asteroid or UFO catching one - see "Emergency Ejection & Rescue"
below.

**Spawns on its own periodic timer**, like the UFO or Shield, and **only
one is ever active at a time** - a new one won't appear until the
previous has run its course. It doesn't move once it appears, and
disappears again after **15 seconds** active (no permanent hazards - a
round has to stay playable), then **pauses for 60 seconds** before the
next one can appear - deliberately more downtime than uptime, so it
reads as a recurring event to react to, not a constant background
presence. Spawn position avoids landing directly on an active ship, and
(Cooperative only) keeps clear of the Space Station.

**Never appears in the first 2 minutes of a stage**, decided - gives
players time to clear the rocks first before a gravity hazard piles on.
Every stage gets its own fresh 2-minute grace period, not just the first
one of the round. A warning sound (`black-hole-approaching.mp3`) plays
once, 5 seconds before it actually appears - whichever of the 2-minute
stage grace period or the usual 60-second post-despawn pause is the
binding constraint at that moment.

Visually: a violet "Accretion Disk," decided — see `docs/art_direction.md`.
The drawn rings are the literal gameplay radii, not an approximation, so
what you see is exactly how close is actually too close.

## The Fracture

Debris's first boss — see `docs/roadmap.md` item 19 for the full landing
note and "The Fracture" future-ideas entry for the complete intended
design this is still working toward. Asteroid contact landed separately,
see item 27 - the death/implosion sequence is the one piece still open.

**Mode-agnostic** (all three modes), triggered by the very first stage
clear of a round: a 3-second "THE FRACTURE" banner — the game's first
announcement that isn't waiting for a keypress, everything else (STAGE
CLEARED, GAME OVER, PAUSED) is. It then materializes **off-screen above
top-center** and drifts slowly down to the arena's center before
stopping, together with 4 large asteroids appearing at the same moment.

**Three tiers, splitting into the next on death** — "the more you damage
it, the more of it there is":

- **Core** (Phase 1) — one large hitbox, 20 hits. Stationary once it
  reaches arena-center; before that, drifting into position is the only
  thing it does. Once stopped, fires a long laser beam in a random
  direction every 2 seconds, one at a time — a brief dim warning line
  first, then a short lethal flash.
- **Fragment** (Phase 2) — the Core's death spawns three of these, one
  of each role, 10 hits each, all three actually moving (a slow constant
  drift, same "pure momentum" as an asteroid) with a real attack apiece:
  - 🔴 **Aggressive** — a pulsing ring expanding out to 3x its own
    radius, every 5 seconds. Lethal only while it's actively growing.
  - 🔵 **Gravity** — pulls everything within 3x its own radius toward
    it, continuously — ships, asteroids, the UFO, Shield pickups,
    adrift Commanders — the same escapable-force rule the Gravity Well
    itself uses, just smaller and weaker. "Acts like a small black
    hole," decided.
  - 🟡 **Launcher** — fires a gold shard at a random living ship (not
    necessarily the nearest) every 3 seconds.
- **Swarm** (Phase 3) — each Fragment's death scatters six of these.
  **Always safe** — see below, this tier isn't a hazard at all.

Debris's first enemy at the Core/Fragment tiers that doesn't die in one
shot. The stage isn't cleared until the Core and every Fragment are
dead, not just the rocks — Swarm collection is never required (below).

**The Core and every Fragment kill an unshielded ship on contact**,
exactly like ramming an asteroid — "behave like rocks," decided. Neither
side of that contact damages the Fracture itself, same as ramming an
asteroid doesn't destroy the asteroid either. This applies to ships
only; asteroids still pass through every Fracture tier untouched.

**Swarm is scrap, not a threat.** Touching a Swarm piece is always
safe and adds 1 to that player's **scrap** count, shown in their HUD
next to their lives/status once it's above zero. Once the last Fragment
dies, a 10-second on-screen countdown starts — whatever scrap is still
uncollected when it runs out is simply gone. Its look ("broken parts of
the Fracture") is a pending visual redesign, not built yet — it still
uses the same jagged-shard look every other tier's shell already has.

**While the encounter is active (Core through the scrap-collection
countdown), the Gravity Well stops spawning**, and any already-active
one is force-despawned the instant the Core materializes — a boss fight
and an unrelated screen-wide hazard piling on top of each other wasn't
the intent.

## Modes

All three are selectable from a mode-select screen before a round starts
— none is the "real" mode with the others bolted on.

### Cooperative

- All active players share the arena and fight the same wave of
  asteroids and UFOs together.
- **No friendly fire** — player shots and player ships pass through each
  other harmlessly.
- **Lives don't apply here** — replaced by Emergency Ejection & Rescue
  (below), added after v1 on request. The round ends once every active
  player is permanently eliminated, or the current wave is cleared and
  players choose to stop.
- Score is shared/team-based: the point of co-op is clearing waves
  together, not competing for a personal high score.
- **Its own global top-10 leaderboard now too** (`systems/HighScoreApi.ts`,
  "Global high scores" below) - decided directly, ranking the *pooled*
  team score (the one number the whole team already shares), separately
  tracked from the other two modes' own boards. If a run qualifies,
  whichever player was the last one eliminated enters the 3-letter
  initials - Cooperative's round only ever ends once everyone's out, so
  there's no one still standing at that exact moment, only whoever fell
  last.

#### Emergency Ejection & Rescue

An unshielded hit doesn't cost a life or respawn the ship on its own —
the pilot **ejects as a Commander** (docs/art_direction.md's
"Astronaut") instead, and needs a teammate to actually save them.

- **The Commander drifts slowly in a random direction**, wrapping at
  arena edges like everything else, with a **10-second countdown**
  rendered directly below them.
- **A real hazard, not just a countdown** — an asteroid, a UFO, or a UFO
  shot can destroy an adrift Commander before anyone reaches them, ending
  that life early regardless of how much time was left.
- **Pickup is automatic on touch** — any other player's ship flying into
  the Commander picks them up. That alone saves the life: the 10-second
  clock stops the instant they're picked up, it doesn't keep running
  through the delivery below.
- **Delivery**: the rescuer tows the Commander to the Space Station
  (docs/art_direction.md's "Cross Dock," fixed at arena center) and
  drops them off simply by flying close enough to it — no separate
  button or precise docking required. The rescued player gets a brand
  new ship there, with the same brief invulnerability window every other
  respawn already grants.
- **If the rescuer is destroyed while towing**, the Commander drops back
  into open space rather than being lost with them, adrift again and
  needing a fresh pickup from anyone. Already rescued (the life was
  saved at the original pickup), so no new countdown starts — but it is
  vulnerable to hazards again while it waits, same as any other adrift
  Commander.
- **Not rescued within 10 seconds, or destroyed by a hazard first** — the
  player is permanently eliminated for the round, the same finality as
  running out of lives in the other modes.

### Competitive

- All active players share the arena; player ships and player shots **do**
  collide with each other — friendly fire is the point.
- Asteroids and any UFOs present are a shared hazard, not aligned with
  any player.
- **Last ship standing wins the round.** A player's own score is tracked
  and shown, but eliminations decide the round outcome, not score — avoids
  a race-to-a-number that can end anticlimactically while ships are still
  flying.
- **Its own global top-10 leaderboard now too** ("Global high scores"
  below) - decided directly, ranking the *winning* player's own score
  (the one number a Competitive round actually produces), separately
  tracked from the other two modes' own boards. If it qualifies, the
  winner enters the 3-letter initials. A draw has no single winner and
  no score to attribute, so it never checks the leaderboard at all.
- Best-of-N round structure (same shape as HyperOut's match format) is a
  natural fit here but is a v1 nice-to-have, not required for the mode to
  work — see `docs/roadmap.md`.

### Single Player

- **Locked to exactly one ship.** Unlike Cooperative (1-4 active players
  allowed) or Competitive, no other player slot can join a Single Player
  round regardless of what the menu's other cards show - this is a
  personal run, not an undersized co-op one.
- **Uses the standard 3-lives/respawn system** (below), the same one
  Competitive uses - not Cooperative's Emergency Ejection & Rescue, since
  there's no teammate around to rescue a solo player. No friendly fire is
  moot with one ship anyway.
- **Its own global top-10 leaderboard** - see "Global high scores" below.
  The one ship's own final score is what's ranked, entered by that same
  player.

## Global high scores

Server-side (`debris-highscore-api`, Rhein Arts' first backend service),
so it survives a browser change or a server restart, unlike the
`localStorage`-based personal best Single Player's board originally
replaced. **Three separately-tracked boards now, one per mode** -
"behave like the one for single player, but are separately tracked,"
decided - not one shared board, and not the other two modes' own
elimination/team mechanics changing to make room for it: Competitive
still decides its round by elimination, Cooperative still by everyone
being wiped out - the leaderboard is a side-tracked result of that
outcome, not a new way to win.

| Mode | What's ranked | Who enters initials on a qualifying run |
| --- | --- | --- |
| Single Player | The one ship's final score | That same player |
| Competitive | The winning player's own score (a draw never checks - no single score to attribute) | The winner |
| Cooperative | The pooled team score | Whoever was the last player eliminated |

**Only the top 3** of the currently-selected mode are shown directly on
the mode-select screen (decided - the full top-10 list was judged too
much for that limited space), refreshed on every mode (re)selection, in
a bordered panel aligned to that mode's own toggle button - itself
clickable through to a dedicated full-screen high score board
(`HighScoreScene`, "in the style of an 80s arcade high score screen, in
Debris's own colors," headlined with the game mode and "HIGH SCORES"
beneath it - decided, see `docs/art_direction.md`) showing all 10 for
that mode, any key or a click to return to the main menu.

A run that beats the current 10th-place score (of that mode's own
board) gets a classic-arcade **3-letter initials entry** screen before
the usual GAME OVER overlay - cycle each letter A-Z (turn), confirm and
advance (fire), same controls the round itself used.

## Lives & game over

**Competitive and Single Player only** — Cooperative replaced this
entirely with Emergency Ejection & Rescue (above); a player there is
eliminated by a failed rescue, never by running out of lives.

- Each player starts a round with **3 lives** — standard arcade
  convention, chosen over a harsher 2 or a more forgiving 5. A hit
  destroys the ship outright and respawns it at the player's own spawn
  point after a brief delay, invulnerable (but unable to fire) for a few
  seconds - only a life-0 hit is a permanent elimination.
- **Competitive**: round ends when only one ship remains (or, in a
  simultaneous-elimination edge case, a draw).
- **Single Player**: round ends the moment the one ship's lives reach 0.
- **The GAME OVER overlay (win/draw/loss alike) returns to the main menu
  on any key, decided** - it no longer restarts a fresh round directly.
  Same overlay, same "press any key" prompt, different destination -
  starting a new round is now a deliberate choice from the menu (the
  Start button) rather than the automatic next step.
