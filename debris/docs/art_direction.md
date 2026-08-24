# Art Direction

Debris shares Rhein Arts' synthwave/CRT identity with HyperOut, rather than
Godspeed's separate "ancient techno-divine" look — it's the closer sibling
in genre and pace (fast arcade action, not an atmospheric descent), so it
should read as clearly related to HyperOut at a glance.

- Neon vector-style ships and effects on a near-black void
- CRT scanline + subtle glow overlay, same idea as HyperOut's `.crt` layer
- Thin glowing outlines over filled shapes, not flat solid fills — reads
  as "vector arcade," closer to the 1979 original than to a painted style
- Screen shake and particle bursts on destruction (ship, asteroid, UFO) —
  cheap to build, does a lot for game feel

## Palette

Four players need four colors that stay legible against each other and
against a red-reserved-for-danger UFO, at a glance, mid-fight:

| Element | Color | Notes |
| --- | --- | --- |
| Player 1 | `#00e5ff` cyan | same hex as HyperOut's Player 1 — a returning player's "my color" instinct carries over |
| Player 2 | `#ff9d00` orange | same hex as HyperOut's Player 2, same reason |
| Player 3 | `#ff2fd6` magenta | new for Debris — needs to read distinctly from both orange and the UFO's red at speed |
| Player 4 | `#8aff4d` acid green | new for Debris — the fourth corner of a legible 4-color neon set |
| Asteroids | `#c9c9d6` cool grey-white | neutral, unaligned with any player or the UFO — should never be mistaken for a threat with intent behind it |
| UFO | `#e0463c` red | matches Godspeed's "red reserved for danger" convention — cross-game consistency, and it's the one enemy that actually aims at you |
| Shield pickup | `#5dade2` sapphire | same hex as Godspeed's `COLORS.pickupShield` — same mechanic, same color, third game in a row reusing it |
| Background | near-black, `#05050a`-ish | same ballpark as Godspeed's `COLORS.background` and HyperOut's void |

Projectiles inherit their firer's color (a player's shot is their color; a
UFO's shot is red) — at 4 players plus a UFO, "whose shot is this" needs
to be answerable without thinking.

## Asteroid shapes: procedural, decided

**No art assets.** Every rock is a randomized polygon generated at
spawn/split time: vertices placed evenly around a center point with
per-vertex radius jitter (and slight angle jitter) for irregularity —
angle order is preserved so the shape never self-intersects. Two
parameters drive the look: vertex count and jaggedness (how much the
radius varies per vertex); size tier (large/medium/small) just scales the
base radius, per `docs/gameplay.md`. All rocks share the same `#c9c9d6`
neutral grey-white (see palette above) — variety comes from shape, not
color. Confirmed against a live sample (regenerate + jaggedness/vertex
sliders) before deciding; the honest trade-off, also noted there: no
hand-authored "character" the way a real art pass gives a fixed set of
shapes, but that's arguably more in the classic vector-arcade spirit than
painted rocks would be. Zero pipeline work, unlike the Warden/Boss/pickup
sprites — generated in code, not measured out of a sheet.

## Ship silhouette: "Interceptor," decided

Chosen from three live-rendered concepts (Classic Wedge, Interceptor,
Reactor Core) — the swept-wing fighter, more character than a plain
triangle without going as far as Reactor Core's synthwave-first look.

Hull as a normalized point path, nose pointing along local `+x` (rotate
the whole path to the ship's current heading at render time), 8 vertices:

```text
[ 1.00,  0.00 ]   nose
[ 0.20,  0.28 ]   right shoulder
[-0.85,  0.68 ]   right wingtip
[-0.45,  0.22 ]   right wing root
[-0.30,  0.00 ]   rear notch (concave)
[-0.45, -0.22 ]   left wing root
[-0.85, -0.68 ]   left wingtip
[ 0.20, -0.28 ]   left shoulder
```

Rendered the same way as the asteroids: a dark fill (`#0d0d16`-ish) under
a thin glowing stroke — the stroke color is whichever player owns the
ship (see palette above), so one path definition serves all four players,
no per-color art needed. Engine flame is a separate triangle drawn from
the rear notch (`[-0.30, 0.00]`), pulsing in length with thrust, same
warm orange glow regardless of hull color so "this ship is thrusting"
reads the same for every player.

## Background: "Twin Planets," decided

**Lives on the play field (`GameScene`), not the menu.** Originally
specced for the start screen (see that section below, which still
describes the menu's *layout* accurately but no longer its background) -
redirected here per explicit instruction once implementation reached
this point. The menu keeps a flat background color; this composition is
what's actually behind the ship and asteroids during a round.

Chosen from three live-rendered concepts (Clean Starfield, Twin Planets +
Nebula, Ringed Planet + Grid Horizon). Two star layers for cheap depth (a
dim, near-static far layer; a brighter, slowly-drifting near layer) and
two planets at different sizes/depths. Confirmed with player-colored dots
standing in for ship positions, to check the background stays quiet
enough to fight in front of before deciding — that was the real risk, not
whether it looked nice alone.

**No nebula wash, on request.** The original concept layered a very
low-opacity violet/cyan haze behind everything (drawn from the game's own
accent hues); removed entirely once implementation reached the play
field and it read as more than "quiet enough to fight in front of" - the
"Twin Planets" half of this section's name is now the accurate
description, not "Twin Planets + Nebula Haze."

**Primary planet: a real photo, `earth.jpg`, decided for v1.** User-provided
(`debris/artwork/earth.jpg`, 1280×1280 JPG, no alpha channel — full-disk
Earth on a black field, NASA/NOAA-style imagery, public domain per the
"why real photos are convenient here" note below). Takes over the
composition's larger/primary planet slot (originally the violet gradient
gas giant in the demo, upper-right area, ~58px radius at the demo's
960×540 reference size) — same position, scale, and slow independent
drift the procedural version used, only the fill changes from a gradient
to the photo.

- **Needs a circular clip at render time.** A JPG is always a rectangle,
  and Earth doesn't perfectly fill the source square (there's black
  margin around the disk already) — clip to a circular path before/while
  drawing the image so the planet reads as a clean disk regardless of how
  the source photo is framed, same silhouette discipline as everything
  else in this game being a crisp shape, not a rectangle with content
  floating in it.
- **Likely needs a touch of color grading**, not used as-is: Earth's
  natural blue/white is fully outside the established accent palette
  above (cyan/orange/magenta/green/red/sapphire) — worth a slight
  desaturation or a subtle tint pass so it reads as "a real planet in
  this game's world" rather than a stock photo pasted over vector art.
  Exact treatment is a v1 visual-polish pass, not decided here.
- **Second body: `jupiter.jpg`, decided**, not the procedural moon
  originally planned. `debris/artwork/jupiter.jpg` (640×640 JPG) takes
  the smaller/secondary slot (lower-left), same circular-clip treatment
  as Earth, at a smaller radius (~80px vs. Earth's ~116px, static, no
  tint applied - unlike Earth its natural color already reads fine
  against the palette). On request, replacing the "smaller moon stays
  procedural" plan from the original concept.
- `saturn.jpg` and `venus.jpg` are still sitting in `debris/artwork/`
  (932×600 8bpp-indexed and 1280×1280 respectively) but aren't wired to
  anything — natural candidates for later floors/waves/modes wanting a
  different backdrop, not decided now.

Why real photos are convenient here specifically: NASA/ESA imagery is
public domain (US government works aren't copyrighted) — no licensing
question for an open-source project, unlike almost any other photo
source. That's what makes this a reasonable exception to "everything is
generated, not authored" elsewhere in this doc, not a contradiction of it.

## Shield pickup: "Diamond Core," decided

Chosen from four live-rendered concepts (Crest, Hex Barrier, Orbiting
Ring, Diamond Core) — a rotating gem with a pulsing center, the universal
arcade "valuable pickup" shorthand, over the more literal shield-crest
readings.

Outer hull, 4-point diamond, normalized:

```text
[ 0.00, -0.68 ]   top
[ 0.46,  0.00 ]   right
[ 0.00,  0.68 ]   bottom
[-0.46,  0.00 ]   left
```

Dark fill under a sapphire (`#5dade2`) glowing stroke, same treatment as
every other outlined shape in this doc, slowly and continuously rotating
(no player-color variant needed — it's a pickup, not owned by anyone). A
separate filled circle at the exact center, radius pulsing roughly
0.12–0.18 (of the same normalized scale) on a slow sine wave, brightens
and dims independently of the rotation — that pulse is the "this is a
pickup, come get it" signal, not just the shape.

## UFO: "Classic Saucer," decided

Chosen from three live-rendered concepts (Classic Saucer, Angular
Interceptor, Ringed Drone) — the 1979-adjacent silhouette, on the read
that a UFO should be instantly legible as *the* classic Asteroids threat
even though everything else in this game's shape language (ship,
asteroids) is built from hard angles rather than curves. Deliberate
exception, not an oversight.

Built from two overlapping ellipses plus three pulsing under-lights, not
a single path:

- **Body**: a wide, flattened ellipse — radii roughly `0.85` × `0.24` of
  the normalized scale, centered slightly below origin (`y ≈ 0.05`).
- **Dome**: a smaller ellipse — radii roughly `0.4` × `0.3`, centered
  slightly above origin (`y ≈ -0.15`), only the **top half** drawn (arc
  from 180° to 360°) so it sits on top of the body instead of reading as
  a full second disc.
- **Under-lights**: three small filled dots along the body's front edge
  (`x ≈ -0.32, 0, 0.32`, `y ≈ 0.13`), each pulsing on its own phase
  offset rather than in unison — a subtle "scanning" read rather than a
  uniform blink.

Dark fill under a red (`#e0463c`) glowing stroke, same treatment as
everything else. No rotation (a saucer doesn't need to visibly spin to
read as alive — the under-light pulse carries that job), but the whole
silhouette can gently bob/tilt during flight, same spirit as the ship's
thrust flame being the "this thing is active" tell.

## Commander: "Astronaut," decided

Cooperative-only (docs/gameplay.md's "Emergency Ejection & Rescue") — the
ejected pilot from an unshielded hit, drifting until rescued. Chosen from
three live-rendered concepts (Escape Capsule, Astronaut, Signal Beacon),
then refined on request (arms and legs added to the base Astronaut
concept, each limb swaying on its own independent phase rather than a
synchronized wave, to read as loose/weightless tumbling rather than a
mechanical animation). The most narratively literal option of the three —
deliberately breaks from the rest of the roster's abstract-vector shape
language, since this is the one entity that's actually a person, not a
shape.

Body (tapered trapezoid), normalized:

```text
[-0.40,  0.20 ]   shoulder, left
[ 0.40,  0.20 ]   shoulder, right
[ 0.26,  0.95 ]   hip, right
[-0.26,  0.95 ]   hip, left
```

Helmet: a circle at `(0, -0.28)`, radius `0.42`. Visor glint: a smaller
circle at `(-0.08, -0.34)`, radius `0.14`, filled at half opacity in the
owner's own color rather than stroked.

Four limbs (2 arms from the shoulders, 2 legs from the hips), each a
2-segment line (shoulder/hip → elbow/knee → tip), independently swaying:

| Limb | Anchor | Base angle | Length | Sway period | Sway phase |
| --- | --- | --- | --- | --- | --- |
| Left arm | `(-0.40, 0.22)` | `0.85π` | `0.85` | ~900ms | 0 |
| Right arm | `(0.40, 0.22)` | `0.15π` | `0.85` | ~760ms | +1.4 |
| Left leg | `(-0.24, 0.95)` | `0.60π` | `0.90` | ~1100ms | +2.6 |
| Right leg | `(0.24, 0.95)` | `0.40π` | `0.90` | ~980ms | +0.7 |

The elbow/knee sits 55% of the way along the limb at `base angle + sway`;
the tip sits the remaining 45% along `that angle + sway × 0.6` (the
forearm/shin bends a little further than the sway alone) — no shared
timing divisor between limbs is the whole point, so nothing moves in
lockstep. A slow whole-body vertical bob (`sin(t / 500ms)`) is layered on
top of all of it.

Dark fill under a stroke in whichever player was ejected (`COLORS.players`
— the one place a "pickup"-family entity is owner-colored rather than a
fixed hue, since it represents a specific person, not a shared item). A
countdown to `COMMANDER.rescueWindowMs` (10s) renders directly beneath it
in the same color while adrift, and disappears the moment another player
picks it up — pickup alone saves the life (decided); the trip to the
Space Station afterward is no longer racing any clock.

## Space Station: "Cross Dock," decided

Cooperative-only, fixed at arena center for the whole round — where a
rescued Commander gets their ship back. Chosen from three live-rendered
concepts (Ring Station, Cross Dock, Hex Platform) — matches the game's
hard-angle vector language (the same family as the Ship's wedge and
Shield's diamond) most closely, unlike the Ring Station's circular
language, which would've sat apart from that family the way the UFO
deliberately does.

Four rectangular docking arms, each `armLength × 0.32` wide, from
`armLength × 0.32` out to `armLength` from center, rotated 0°/90°/180°/270°
— `armLength` itself is `SHIP_HULL_SCALE × 3` ("3× ship size," the
request's own sizing), so the arms alone already read as roughly a ship's
length. A square hub at the center, `armLength × 0.32` half-width. A
pulsing center light in the same sapphire as the Shield pickup
(`#5dade2`) — "this is a safe, active destination," reusing Shield's own
pulse-as-signal language rather than inventing a new one.

**Trigger zone only, decided — no physical collision.** Not Matter-backed
at all: ships and asteroids pass through it exactly like they already
pass through each other in Cooperative. `GameScene` checks a carrying
ship's plain distance to the station's center against
`SPACE_STATION.dropOffRadius` (`armLength × 1.15` — slightly bigger than
the visual silhouette, a forgiving trigger rather than a pixel-precise
dock) once per frame; there's no sensor body or collision event involved.

## Start screen / menu, decided

Structured like HyperOut's own start/menu screen — big glowing title,
a control legend, a mode toggle, one Start button, the same CRT scanline
treatment (`repeating-linear-gradient` scanlines + an inset vignette,
`mix-blend-mode: multiply`) — adapted for 4 players and gamepad detection
instead of a fixed 2-keyboard layout. **Background: flat color, not the
Twin Planets composition** — that composition was redirected to the play
field instead (see the Background section above), per explicit
instruction once implementation reached that point. The CRT scanline
treatment mentioned above is now built (`docs/roadmap.md` item 12) — a
viewport-level overlay (`debris/game/index.html`'s `.crt` div), so it
applies here on the menu too, not just the play field.

- **4 player-status cards**, one per slot, each showing a small
  Interceptor-hull icon (see ship section above) in that player's color.
  **P1 and P2 each have a source toggle** (keyboard ⇄ gamepad, defaulting
  to keyboard) — the one place this screen is a control the player sets,
  not just a status display. **P3/P4 have no toggle**, gamepad-only per
  `docs/controls.md`. Every slot currently set to "gamepad" (P3/P4 always,
  P1/P2 if toggled) **polls the real Gamepad API** and only reads READY
  once an actual controller claims it, in connection-order priority
  P1 → P2 → P3 → P4 — see `docs/controls.md` for why assignment works
  this way instead of manually picking a specific controller.
- **Mode toggle**: Cooperative / Competitive / Single Player, same
  segmented-button language as HyperOut's own mode picker, now a 3-way
  rather than 2-way toggle. Selecting Single Player locks the P2-P4
  player cards (they read LOCKED regardless of their own source/
  readiness, per `docs/gameplay.md`'s "Single Player" section) and shows
  the persisted personal best score beneath the toggle.
- **Start has no player-count gating.** A solo P1 can press Start
  immediately, regardless of mode — decided over requiring 2+ active
  players before Competitive would do anything. (Competitive with only
  one active ship is a degenerate case — an instant, uncontested "win" —
  but that's a mode-logic question for `docs/gameplay.md` to pick up
  later, not a reason to gate the menu's Start button itself.)
- **Music/SFX volume sliders are included in the v1 menu layout**, same
  placement and style as HyperOut's - and, since sound and music both
  landed well before this note was updated, **fully functional**, not
  scaffolded/inert as originally planned here: draggable, live-update
  whatever's currently playing, apply to every sound played anywhere else
  in the game, and persist across reloads via `localStorage`
  (`systems/AudioSettings.ts`), same pattern as HyperOut's own
  `saveSettings`/`loadSettings`.

## In-round HUD, decided

**Each active player gets their own corner**, in their own color
(`COLORS.players`) - not a single shared readout. P1 top-left, P2
top-right, P3 bottom-left, P4 bottom-right - the same quadrant layout as
the ship spawn diamond (`GameScene.PLAYER_SPAWN_OFFSETS`), so "which
corner is mine" matches "which corner did I spawn near." Only active
slots get a corner - a 2-player Cooperative round shows two corners, not
four with two blank.

Each corner is a small stack of lines, currently:

```text
P1
SCORE 120
●●●
```

`●` = a life still held, `○` = spent (`LIVES_PER_PLAYER`, currently 3).
Score follows `docs/gameplay.md`'s per-mode framing: Cooperative and
Single Player show the same pooled/personal total in every corner (score
is shared, or there's only one corner to begin with); Competitive shows
each player's own tracked score, since eliminations decide that mode's
round, not score. **Built to grow**: more per-player stats (on request)
just become more lines in the same stack, not a layout rework - top
corners anchor from the top and grow downward, bottom corners anchor
from the bottom and grow upward, so adding lines never pushes text off
the natural corner or across the arena's midline.

The mode indicator (`COOPERATIVE`/`COMPETITIVE`/`SINGLE PLAYER`) lives
top-center, out of every corner's way.
