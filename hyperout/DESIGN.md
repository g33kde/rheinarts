# Grot Volley — Game Design

A browser volleyball game in the spirit of **Blobby Volley**: two Grots, a net
in the middle, one ball, simple controls, and physics that feel right.

## Goals
- Slow but *determined* pacing — rallies you can read and react to.
- Physically believable ball behaviour and head-hits (direction **and** power).
- Runs in any modern browser; deploys as a static site on Kubernetes.

## Court
- Logical play area **1200 × 675** (16:9), scaled to fit the window (letterboxed).
- Left & right walls, a floor (the sand), and a centre net.
- Net rises from the sand to ~45% height with a rounded top cap.
- Ball touching the sand ends the rally.

## The Grot (player)
- Modelled physically as a **circle** whose centre rests on the sand; only the
  top dome is ever in play → "heads the ball" falls out naturally.
- Confined to its own half (cannot cross the net).
- Moves: **left / right** and a single **jump** (no double-jump; gravity returns it).
- Drawn as clean vector art (yellow dome, orange back-spikes, purple VR visor
  with a cyan waveform, light-blue scarf, little feet) — swappable for a sprite later.

## Ball physics
- Circle with a velocity vector, constant gravity, gentle air drag.
- **Fixed 120 Hz timestep** with an accumulator, decoupled from rendering →
  identical behaviour at any refresh rate; deterministic and accurate.
- Walls & ceiling: reflect with a restitution < 1 (slightly lossy).
- Net: rounded-top radial bounce; flat-side horizontal bounce below the cap.
- **Max speed cap** keeps the "slow but determined" feel even after a hard spike.

### Grot ↔ ball hit (the important part)
- **Direction** — the collision normal points from the Grot's centre through the
  ball's centre. Centre-top contact pops the ball straight up; a glancing side
  contact sends it off at an angle. Where the head meets the ball decides where
  it goes.
- **Power** — the ball's velocity is reflected *relative to the Grot*, then the
  Grot's own motion is added back in. Jumping up into the ball (or running into
  it) transfers real energy: **the harder you move into it, the faster it leaves.**
  A small fixed "pop" guarantees a standing Grot can still bump the ball.

## Rules
- **3-touch limit** per side. The 4th consecutive touch by a side is a **fault**
  → point to the opponent. The touch counter resets when the ball crosses the net.
  (One Grot per side may legally take all 3 touches — bump, set, spike solo.)
- Net is a solid obstacle: the ball just bounces off it, play continues (no fault).
- **Rally scoring**: every rally scores a point. First to **15, win by 2**.
- **Serve**: the loser of the previous rally serves; the ball drops above their side
  after a short "get ready" pause.

## Modes
- **1 Player** vs a single-difficulty AI Grot.
- **2 Players** local (shared keyboard).

## Controls
| | Move | Jump |
|---|---|---|
| **Player 1 (left)** | `A` / `D` | `W` or `Space` |
| **Player 2 (right)** | `←` / `→` | `↑` |

Menus: `1` / `2` pick a mode; on the win screen `Enter` rematches, `Esc` returns to menu.

## AI (v1, one level)
Anticipates the ball with a short velocity lead, parks slightly behind it so its
head aims the return toward the opponent, and jumps to attack when the ball is
high and close on its own half. Deliberately not frame-perfect, so it's beatable.

## Tuning
Every feel knob lives in the `CONFIG` object at the top of
[`src/game.js`](src/game.js) — gravity, jump height, move speed, restitutions,
max ball speed, touch limit, points to win, timers.

## Non-goals for v1 (possible later)
- Touch / on-screen controls for mobile.
- Multiple AI difficulties, sound effects, power-ups, online play.
