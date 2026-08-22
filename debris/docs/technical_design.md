# Technical Design

One focused doc rather than a padded three-doc set. (Godspeed nominally
has separate `technical_design.md`/`coding_standards.md`, but in
practice they're both near-empty — the real substance lives in its
`ai_development_guide.md`, which is itself mostly generic advice. This
doc tries to only say things that are actually specific to Debris.)

## Stack

- TypeScript
- Phaser 3, using its **Matter.js** physics integration (not Arcade
  Physics) — see `docs/vision.md`/the "main focus should be on physics"
  framing for why: v1's ship/asteroid physics don't strictly need a real
  rigid-body engine, but the roadmap's future ideas (joint-pushing heavy
  debris, gravity wells, mass-coupled towing) do, and Matter.js ships
  inside Phaser at no extra dependency cost.
- Vite
- Docker + Kubernetes, same shared-image deployment pattern as
  HyperOut/Godspeed (see root `DEPLOYMENT.md`) — not yet wired up for
  Debris specifically, but no reason to expect it'd differ.
- Vitest for testing (see Testing below)

## Physics

- **Gravity: 0.** This is a top-down space game, not a platformer —
  Matter's default downward gravity gets turned off outright, not tuned.
- **Feel: realistic drift, not arcade-tight damping.** Chosen over
  aggressively dialing down Matter's defaults to fake a tighter, more
  modern arcade feel. Worth noting this arguably lines up *better* with
  `docs/vision.md`'s "the actual feel of 1979 Asteroids" goal than the
  tighter option would have — the original ship really does carry
  momentum and drift for a long time with very little friction; heavily
  damping it would have been a modern arcade feel standing in for the
  classic one, not a match for it.
- **Collision filtering is a runtime toggle, not a world rebuild.** One
  Matter world persists for the life of a round; ship-vs-ship collision
  (off in Cooperative, on in Competitive) flips via Matter's collision
  category/mask bits when the mode is chosen, rather than tearing down
  and reconstructing physics bodies per mode.

## Input

**Per-player input adapters.** Each of the 4 player slots owns its own
input-reader instance — keyboard-bound for P1/P2, gamepad-bound for P3/P4
(see `docs/controls.md` for the actual mapping) — exposing the same
turn/thrust/shoot query interface regardless of source. Ship logic asks
its adapter "am I turning / thrusting / shooting" and never knows or
cares whether that's backed by a keyboard zone or a `Gamepad` object.
This is also naturally how a P3/P4 slot "activates" — no adapter
instance exists for that slot until a gamepad is actually connected.

## Testing

**Pragmatic mix**, same philosophy Godspeed used successfully: rule-based
logic — scoring, asteroid split decisions, mode rules (Cooperative vs.
Competitive), life/respawn logic, wave progression — stays in plain,
pure, unit-tested functions (Vitest), independent of Phaser or Matter.
Matter.js itself owns collision detection and physics response directly,
**not** wrapped in a testable abstraction layer — same boundary Godspeed
drew around Phaser's rendering internals: test the rules, not the engine.

## v1 tuning defaults

Starting points confirmed for a first playable build, not treated as
final — see `docs/gameplay.md` for the full context each of these lives
in:

| Value | v1 default |
| --- | --- |
| Shot cooldown | ~250ms |
| Max on-screen shots (per player) | 4 |
| Asteroid speed, small vs. large | ~1.8–2x |
| Score — large / medium / small asteroid | 20 / 50 / 100 |
| Score — UFO | 200+ (exact figure still open) |
| Shield spawn cadence | ~20–30s |
| Lives per player | 3 |

## Not yet decided

- Max on-screen shots *per asteroid* size isn't a thing — cap is
  per-player, global across all asteroid sizes, per the table above.
  Worth confirming this reads right once playable.
- UFO score's exact value above the 200 floor.
- Deployment specifics for Debris in the shared `Dockerfile`/`nginx.conf`
  — expected to mirror Godspeed's build-stage pattern closely, not yet
  written down.
