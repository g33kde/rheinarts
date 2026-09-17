# Changelog

A running log of implementation work on Debris, written for AI coding agents
(and humans) picking up the project cold. Read the newest entry before
starting work, then check `docs/roadmap.md` for the next planned item.

Add a new entry — newest at the top — whenever you complete a feature or
milestone, same convention as Godspeed's `CHANGELOG.md`.

---

## 2026-09-17 — Bosses are collision-aware: ships and asteroids now take damage on contact

Requested directly: "make both (and future) bosses collision aware... ships
or asteroids hit it, they get destroyed. Shield protects the player (-1
shield per collision)." Two real forks resolved via `AskUserQuestion` before
touching code: **Cardinal's arms become a ram hazard too** (previously only
the bare core was - arms let ships pass straight through, despite being "the
widest, most solid-looking part of the structure" per the design doc), and
**scope extends to the bosses' own attacks** (Cardinal's plasma ball,
Fracture's launcher shard), not just their bodies.

**Ship-vs-boss-body already existed for The Fracture** (Core/Fragments kill
an unshielded ship, shield absorbs and consumes a charge, boss takes no
damage) - untouched, already correct. Cardinal's core-only ram check
(`updateCardinalAttacks`) is unchanged too. What's new:

- **Cardinal arms are now a ram hazard** (ship and asteroid alike), reusing
  the exact same `armStart`/`armEnd` segment + `distanceToSegment` math the
  existing projectile-vs-arm hit-test already used, just with the target's
  own radius added (`CARDINAL.armHitWidth / 2 + SHIP.radius`/`+
  asteroid.radius`) - reverses this file's own prior "arms are deliberately
  not a ram hazard" comment.
- **Asteroid-vs-boss-body, for both bosses**: an asteroid touching The
  Fracture's Core/Fragment or The Cardinal's core/arm is destroyed *whole*
  (no split, no score) - reusing the exact precedent the Gravity Well's own
  lethal center already set (`processBlackHoleCaptureAndLethal`), not the
  normal shot-destroys-it split cascade, since there's no player action to
  reward here. The boss itself takes no damage from either kind of contact,
  same as it already took none from a ship ram. Fracture's Core/Fragment are
  Matter-backed, so this is just a widened `collisionFilter.mask` (added
  `CATEGORY.ASTEROID`) plus a new `handleCollision` branch; Cardinal isn't
  Matter-backed at all, so it's a new manual per-frame distance/segment
  check in `updateCardinalAttacks`, mirroring the ship-ram checks exactly.
- **Cardinal's plasma ball and Fracture's launcher shard now also destroy
  an asteroid they hit** (previously ship-only), consumed on contact either
  way, same as a UfoShot already is - both are real Matter bodies, so this
  is the same widened-mask-plus-branch treatment as the Fracture body
  above.
- One new shared queue, `pendingBossAsteroidHits: Asteroid[]`, covers every
  boss-body-contact source (Fracture's Matter collision, Cardinal's manual
  core/arm checks) - same "one array covers every source" shape
  `pendingShipHits` already uses, so a future boss (Matter-backed or not)
  has an obvious queue to feed rather than inventing its own. The plasma
  ball/shard get their own small typed queues instead (`{asteroid, plasma}`/
  `{asteroid, shard}`) since, unlike direct body contact, there's a second
  object (the attack itself) that also needs destroying.

Verified live against the running dev server (not just the build/test
suite): spawned a real Cardinal and Fracture, placed asteroids directly on
the core and on a living arm and confirmed both destroyed with no boss
damage; placed a shielded ship on a living arm and confirmed the shield
charge dropped to zero while the ship survived the first hit, then was
destroyed by a second hit while still resting in the danger zone with no
shield left (expected - same behavior a shielded core ram already had,
not a new edge case this introduced); fired a plasma ball into a live
asteroid and confirmed both were destroyed.

## 2026-09-17 — Scrap pickup enlarged (again)

Reported too small: `FRACTURE.swarmRadius` (`entities/FractureSwarmBit.ts`'s
hitbox) and `TARGET_SPAN_PX` (its visual tetromino footprint) went from
7/12px to 11/20px, chosen from a live size comparison against the smallest
asteroid's own 16px-across footprint before implementation. This is the
third size this entity has been - originally 12/24px (bigger than the
smallest rock), corrected to 7/14px specifically to be "smaller than or the
same size" as it (item 19 Pass 4), and now deliberately bigger again after
that correction turned out to read as too small in practice. Same entity
covers both The Fracture's own Swarm tier and The Cardinal's arm-scrap, so
this applies to both identically with no extra changes needed. Verified
live: spawned a real `FractureSwarmBit` next to a live asteroid via the dev
server (not just the size-comparison mockup) and screenshotted the actual
rendered glow/tetromino at true gameplay scale.

## 2026-09-17 — Bigger destruction particles; stackable Shield (max 2)

Two independent requests, both reviewed live before implementation.

**Destruction-burst particle size** (`entities/DestructionBurst.ts`) — was a
flat 2px-radius dot for every burst type (ship/asteroid/UFO alike), never
configurable. Compared 2-6px side by side at real burst density (10-particle
asteroid pop) via a live-rendered mockup before picking a number. Landed:
`sizePx` added to each of `EFFECTS.shipBurst`/`asteroidBurst`/`ufoBurst`
(`GameConfig.ts`), scaled per type on request rather than one flat constant -
asteroid 4px, ship 5px, UFO 6px, following the same "bigger death = bigger
effect" logic `count`/`speedRange` already used. `DestructionBurst`'s
constructor takes the radius as a parameter now instead of a hardcoded
literal; its one call site (`GameScene.spawnBurst`) passes `config.sizePx`
through.

**Shield stacking** (`entities/Ship.ts`, `docs/gameplay.md`) - was a single
non-stacking charge (v1 scope, `docs/gameplay.md` explicitly flagged it as
"revisit if playtesting says one charge is a good"); now stacks up to
`SHIELD.maxCharges` (2, `GameConfig.ts`). `Ship`'s internal `shielded:
boolean` became `shieldCharges: number` - `grantShield()` increments
(capped, a no-op past max, same courtesy the old single-charge version had),
`consumeShield()` decrements by one. `hasShield`/`consumeShield()`'s public
call sites (`GameScene`'s hit-absorption and pickup paths) needed no changes
at all - `hasShield` stayed a boolean (`charges > 0`), so every existing
"does this ship survive a hit" check kept working unchanged.

Visual: reviewed as a published Artifact mockup comparing two animated
treatments for the second charge - a rotating segmented outer ring (echoing
The Cardinal's rotation motif) vs. a pulsing/breathing solid outer ring -
before writing any game code. **Pulsing ring chosen.** The first charge is
the original static sapphire ring, completely unchanged; a second charge
adds an outer ring whose radius and alpha both ease in and out
independently (`Ship.draw()`), so the charge count reads at a glance with no
new HUD element - same "the visual is the only tell" rule the
respawn-invulnerability flicker already follows. Verified live against the
running dev server (not just the mockup) by temporarily exposing the Phaser
game instance on `window` (reverted after), granting a ship 1 then 2
charges, and screenshotting both - confirmed the second ring renders as a
clean, distinct circle at true gameplay scale, not just enlarged in the
concept sheet.

## 2026-08-29 — Fixed: Gravity Well permanently sped up asteroids

Bug report, investigated rather than guessed at: "[the Black Hole]
accelerates the asteroids... without destroying [them] they are too
fast to shoot." Root cause: `Ship.update()` clamps to `SHIP.maxSpeed`
every frame, so a ship caught in a Gravity Well's escapable outer band
(a continuous applied force, `applyBlackHoleGravityForces`) never runs
away - but `Asteroid.update()` had no speed cap at all, and asteroids
have `frictionAir: 0` by design. A rock pulled by a Black Hole (or a
Fracture gravity Fragment - `systems/BlackHoleGravity.ts`'s force math
reused there directly) kept accelerating for as long as it stayed in
the field, and since nothing ever decayed it back down, the boost was
*permanent* - well past the hazard's own despawn, for the rest of the
round.

Two rounds of `AskUserQuestion` before writing any code: first,
whether to cap the pull's peak speed or let any excess bleed off
afterward - "mainly after it's gone" (the in-the-moment acceleration
wasn't the actual complaint, only that it never wore off), so no cap
was added, only a decay. Second, whether the decay should be Black-Hole-
specific or a general rule - "decay whenever not currently near any
gravity source," so it also covers the Fracture boss's own gravity
Fragment for free, no per-hazard special-casing.

- **`systems/MovementSystem.ts`**: new `decayExcessSpeed(velocity,
  baseSpeed, decayPerSecond, deltaSeconds)`, pure/tested, same
  direction-preserving shape as the existing `clampSpeed`. No-ops at or
  below `baseSpeed`, and never decays past it (`Math.max`).
- **`GameConfig.ts`**: `ASTEROID.speedDecayPerSec` (0.3 - a starting
  guess, ~4-5s for a 3x-boosted rock to fully settle back down).
- **`entities/Asteroid.ts`**: stores its own tier `speed` as `baseSpeed`
  (previously read once and discarded); `update()` gained an
  `isBeingPulled` parameter - only decays excess speed while `false`, so
  a rock actively mid-pull keeps whatever dramatic acceleration the
  hazard is currently giving it.
- **`GameScene.ts`**: `applyBlackHoleGravityForces`/
  `applyFractureGravityForces` both now take a shared `pulledAsteroids:
  Set<Asteroid>` and add any asteroid they actually apply a nonzero
  force to (their `applyGravity` closures now return whether they
  pulled anything, instead of a bare `void`); the per-asteroid
  `update()` call reads `pulledAsteroids.has(asteroid)` to decide.

Verified: `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`
(166/166, +5 new `decayExcessSpeed` cases) all clean. Confirmed live
against the running dev server: boosted a real asteroid to ~3x its own
base speed, held `isBeingPulled=true` for 30 frames and confirmed zero
decay (speed stayed exactly 2.0, dramatic acceleration preserved while
actively pulled), then switched to `isBeingPulled=false` and watched it
decay linearly back to its exact base speed (0.67) over ~4.4 real
seconds, with no overshoot below it.

---

## 2026-08-28 — Reverted Ship/UFO glow (kept ship geometry detail)

Follow-up, requested directly, to the shape polish pass below. Both
outer-glow treatments pulled back off:

- `entities/Ship.ts` - removed the layered outer-glow strokes and the
  bright inner "neon tube" core line, plus their now-unused
  `GLOW_LAYERS`/`GLOW_BASE_WIDTH`/`GLOW_WIDTH_STEP`/`GLOW_BASE_ALPHA`/
  `CORE_LINE_ALPHA` constants. **Kept**: the geometry-detail pass
  (canopy lens, wing panel lines, engine-intake ring) - only the glow
  half of the ship's own two-part treatment was reverted, the two were
  independent additions to `draw()` and came out cleanly on their own.
- `entities/Ufo.ts` - removed the same layered outer-glow strokes and
  their constants. Glow was the UFO's *entire* polish-pass addition
  (geometry detail was concept-reviewed but never landed there - see
  `docs/art_direction.md`), so this entity is now back to its exact
  pre-polish look.
- Asteroid's shape families + per-rock craters/cracks
  (`systems/AsteroidShape.ts`, `entities/Asteroid.ts`) are untouched -
  they never had a glow treatment to begin with (deliberately skipped
  during scoping over density concerns).

Verified: `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`
(161/161, unchanged - no logic branch removed, purely visual) all
clean. Confirmed live against the running dev server, same
plain-`Graphics`-object rendering approach the original pass used to
sidestep this session's headless-Chromium `Ship`-rendering quirk: both
ships and the UFO render as plain outlined shapes with no halo at real
gameplay scale and enlarged, the ship's canopy/wing/engine detail still
visible, asteroid field unaffected.

`docs/art_direction.md`'s Ship/UFO sections and `docs/roadmap.md` item
24 both updated with "landed, then reverted" notes rather than being
quietly rewritten as if the glow never happened.

---

## 2026-08-28 — Ship/asteroid/UFO shape polish pass

Item 12's one remaining piece (`docs/roadmap.md`) - explicitly skipped
at the time for lacking a real brief. Got one now: requested directly
as "come up with ideas and show me the mockup... invest some time,"
so this landed via a proper live-rendered concept sheet (all three
entities, real game colors, drawn in-engine at enlarged scale) reviewed
through two rounds of `AskUserQuestion` before any of it was built -
first on overall direction (rendering-only glow vs. geometry detail vs.
a per-entity mix), then a final round that added per-rock asteroid
detail back in after the initial recommendation had skipped it. See
`docs/roadmap.md` item 24 and `docs/art_direction.md`'s "Polish pass,
landed" notes (Ship/Asteroid/UFO sections) for the full per-entity
breakdown - summary:

- **Ship**: glow (layered strokes behind the hull + a bright inner
  core line, `entities/Ship.ts`) *and* geometry detail (canopy lens,
  wing panel lines, engine notch) - both, since at most 4 ships ever
  exist at once, no density risk.
- **UFO**: glow only (`entities/Ufo.ts`) - a reviewed geometry-detail
  concept (rivets, a dome rim highlight) wasn't landed, judged too
  subtle to earn its cost at the UFO's real on-screen size.
- **Asteroid**: no glow at all, deliberately - the one entity where a
  dozen-plus can be on screen at once, flagged as a real density risk
  during scoping. Got two other things instead: **shape families**
  (`ASTEROID.shapeFamilies` in `GameConfig.ts` - rounded/jagged/spiky,
  one picked at random per rock via the new `pickShapeFamily`,
  replacing the single fixed vertexCountRange/jaggedness every rock
  used to share) and **per-rock surface detail** (procedural craters +
  crack lines, `generateCraters`/`pickCrackTargets`, both new pure
  functions in `systems/AsteroidShape.ts`) scaled down by size tier -
  small rocks get none, both too tiny to read and the tier the density
  concern was actually about.

All three of the new pure functions (`pickShapeFamily`, `generateCraters`,
`pickCrackTargets`) are seedable/deterministic and unit-tested, same
convention as `generateAsteroidPoints` itself. Every glow/detail tuning
constant (layer counts, widths, alphas, crater/crack counts per size)
is file-local rather than in `GameConfig.ts` - cosmetic only, doesn't
touch hit-testing, same "stays local" convention `Cardinal.ts`'s own
cosmetic constants already established.

Verified: `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`
(161/161, +10 new) all clean. Confirmed live against the running dev
server at **real gameplay scale**, not just the enlarged concept
sheet - spawned a full 8-asteroid wave and confirmed shape variety +
crater/crack detail read correctly without becoming visual noise at
that density. Hit one real snag along the way: `Ship`'s actual
Matter-wrapped instance rendered as an unrelated glyph in this specific
headless-Chromium test session - traced it by reproducing the exact
same artifact against the pristine pre-polish `Ship.ts` (proving it
predates this change entirely, not a regression) and by rendering the
identical hull-drawing code through a plain (non-Matter) `Graphics`
object instead, at both real and enlarged scale, which rendered
correctly every time - confirms the polish code itself is right; the
artifact is specific to this test harness's headless WebGL context, not
to a real browser, and is flagged here rather than quietly worked
around.

---

## 2026-08-27 — Safe spawn + 3s invulnerability at every boss stage start

Requested directly, in response to the question "where does the ship
spawn when a Cardinal stage starts" surfacing a real gap: the answer was
the normal home diamond, not the boss-safe corners a *mid-fight*
respawn already gets. "For all bosses in all game modes the spawn point
should be safe and the players should be 3 seconds unbreakable."

Root cause: `resetStageHazards()` (which does the actual teleport-home
step at every stage transition) runs *before*
`materializeFracture()`/`materializeCardinal()` create the boss entity
itself, so `spawnOffsetFor()`'s own `isBossEncounterActive()` check
(`this.fracture !== undefined || this.cardinal !== undefined`) still
read false at that exact moment - the mid-fight-respawn path
(`processPendingRespawns`) was never affected, only this one opening
moment.

Fix: `resetStageHazards()` now takes an explicit `isBossStageStart:
boolean` instead of relying on that timing. `beginNextLevel()` (normal
stage) passes `false` - unchanged behavior, home diamond,
`SHIP.respawnInvulnerabilityMs` (2s). `materializeFracture()`/
`materializeCardinal()` both pass `true` - ships now use
`BOSS_RESPAWN_OFFSETS` unconditionally (the same safe corners a
mid-fight respawn uses, including in Single Player, which
`isBossEncounterActive()` already exempts from its usual dead-center
spawn during an active boss encounter) and a new
`BOSS_STAGE_START.invulnerabilityMs` (3000ms, "3 seconds unbreakable,"
decided - longer than the normal 2s respawn grace, since a boss fight's
opening moment is a higher-stakes spot to appear vulnerable in).
Applies to all three modes alike, since `resetStageHazards()` is the one
shared call point for every stage-begin, boss or not.

Verified: `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (151/151,
unchanged - orchestration, no new pure-logic branch) all clean. Confirmed
live against the running dev server: Single Player + The Cardinal spawns
at the top-left boss corner `(220, 220)`, not dead-center `(960, 600)`;
Cooperative + The Fracture puts P1/P2 at their own corners, both
invulnerable; invulnerability confirmed true at +2999ms and false at
+3001ms (exactly 3s, not the old 2s) for a boss-stage start, while a
normal stage transition (tested with `fracture`/`cardinal` explicitly
cleared first, to rule out a leftover-reference test artifact) still
lands ships on the ordinary home diamond with exactly 2s - fully
unaffected.

---

## 2026-08-27 — Audited every boss attack for the same hit-test gap

Follow-up, requested directly ("check for all bosses") after the laser
fix below. Walked every Fracture/Cardinal attack mechanic looking for
the same "ship treated as a dimensionless point" pattern:

- **Reliable, no change needed**: Fracture's Fragment 🟡 launcher shard
  and Cardinal's Phase 2 plasma ball are both real Matter-physics bodies
  (`CATEGORY.SHIP` in their collision mask) - normal circle-vs-circle
  collision, inherently radius-aware on both sides. Fracture's Core/
  Fragment ship-ram ("behaves like rocks") is also real Matter collision,
  not a manual check. Fracture's 🔴 aggressive ring and Cardinal's Phase
  3 detonation blast are both solid, filled growing-circle checks (not
  thin moving corridors) - a ship inside the radius gets caught as the
  boundary sweeps past it, no precise-alignment problem to have.
- **Same pattern as the laser, fixed for consistency (not the same
  severity)**: Cardinal's core-ram hazard
  (`distance <= CARDINAL.coreRadius`) and Fracture's 🔴 ring hit-test
  (`distance <= ringRadius`) both omitted the ship's own radius too -
  now `+ SHIP.radius` on both. Neither was the "essentially unhittable"
  bug the laser was (the core doesn't move relative to itself, and the
  ring is a solid disk, not a corridor a moving beam sweeps through) -
  these were a few pixels of edge-case imprecision, not a functional
  bug, fixed because the same "a ship's real size should count, not
  just its center coordinate" principle applies everywhere it's cheap
  and safe to apply it.
- **Left alone, deliberately**: Cardinal's Phase 3 detonation blast is
  evaluated once, at the moment of detonation, already at its full final
  `detonationMaxRadius` - not a moment-in-time partial value like the
  ring's growing radius. The missing ship-radius there is genuinely
  negligible (a few pixels at a single evaluated instant), not worth the
  same treatment.

Verified: `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (151/151,
unchanged - both new call sites reuse the already-tested
`SHIP.radius`/`+` pattern, no new pure-logic branch to cover) all clean.

---

## 2026-08-27 — Fixed: The Cardinal's Phase 1 laser rarely killed ships

Bug report, investigated live rather than guessed at. Root cause: The
Cardinal's laser hit-test (`isPointOnBeam`, `systems/BeamGeometry.ts`)
treated a ship as a dimensionless point - correct-in-practice for The
Fracture's laser (a fixed-angle beam that holds still for its whole
300ms active window, `entities/FractureLaser.ts`), but a real bug for
The Cardinal's, which - per its own design spec, "the danger zone is a
rotating cross, not a fixed one" - keeps rotating throughout its entire
1-second firing window. A beam that's actually sweeping needs the
target's own physical size to register a hit at all; one that's static
doesn't.

Confirmed via a controlled live test before touching any code: forcing
the laser "active" against a correctly-positioned, held-still ship
(bypassing the real attack-cycle timer entirely) did correctly detect
and queue the hit, and calling the detect+process pipeline synchronously
did correctly destroy the ship - proving the underlying kill pipeline
was never broken. The actual gap only showed up simulating a *real*
frame-by-frame sweep through a firing window: `isPointOnBeam` checked
only `distanceToSegment(shipCenter, beamStart, beamEnd) <= width/2`
(7px either side of the line, `CARDINAL.laserWidth` 14) with zero
allowance for the ship's own radius - a corridor narrow enough, on a
beam moving ~3px/frame at typical engagement range, that a player who
wasn't standing on the mathematically-precise swept line at the exact
right instant just never got hit, which reads exactly like "the laser
never destroys ships."

Fix: `isPointOnBeam` gained an optional `pointRadius` parameter
(defaults to 0, fully backward compatible with every other existing
caller/test), widening the effective corridor to `width/2 + pointRadius`.
Both real callers - The Cardinal's and The Fracture's own laser-vs-ship
checks (`GameScene.updateCardinalAttacks`/`updateFractureAttacks`) - now
pass `SHIP.radius` (8), matching how every *other* hazard in this game
already treats a ship's actual physical footprint rather than its exact
center coordinate. Fracture's laser wasn't broken (static beams don't
need this), but the fix applies there too for consistency - a ship's
true collision size should count the same way against every hazard.

Verified: `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`
(151/151, +4 new `isPointOnBeam` cases covering the new parameter) all
clean. Confirmed live: simulated the exact frame-by-frame sweep a real
firing window produces (60fps steps through the full 1000ms window,
`cardinal.update()`+`updateCardinalAttacks()` called each step, no
shortcuts) against a ship parked near - not exactly on - the beam's
predicted midpoint line; the widened corridor registered the hit
earlier in the sweep than the old point-only math did. Full "does this
now feel fair to dodge in real play" needs live human play to confirm -
that's inherently a moving-beam-vs-moving-player timing question a
script can't fully settle, flagged honestly rather than overclaimed.

---

## 2026-08-27 — Stage-clear weapon shop

The shop UI the previous weapon-upgrade entry deliberately didn't build
("do not build a complete shop UI unless necessary") - requested
directly as its own follow-up. Fully designed via two rounds of
`AskUserQuestion` (8 confirmed forks total: trigger timing, multiplayer
layout, input model, mode scope, then eliminated-player handling and
purchase timing) plus a drawn mockup reviewed and approved before any
code was written.

Replaces the old "STAGE CLEARED / PRESS ANY KEY FOR NEXT LEVEL"
`waitForKeyPress` flow with a new `'shop'` session state
(`GameScene.enterShop()`/`updateShop()`/`exitShop()`) that owns its own
per-frame update loop, same "different per-frame path than a one-shot
keypress" shape `updateInitialsEntry()` already established for the
initials-entry screen - this one just does it for up to 4 players'
inputs independently at once instead of one shared input.

- **One shared screen, every stage clear** - `this.players.length`
  panels (not always 4, only players actually in this round), laid out
  side by side and centered, matching `MenuScene`'s own card style.
- **Each player's own existing controls, no new bindings** - `turnDirection`
  (edge-triggered, same rising-edge detection `updateInitialsEntry` uses)
  cycles a per-panel cursor through their 3 upgrades then a trailing
  READY row (`systems/WeaponUpgrades.ts`'s new `nextShopCursor`, pure and
  unit-tested); their fire input confirms - on an upgrade row that's an
  immediate purchase via the already-built `purchaseWeaponUpgrade()`
  hook (scrap deducts and the upgrade activates right then, no staged/
  pending state), on READY it toggles that player's ready flag so they
  can un-ready and keep shopping.
- **No timer - waits for every non-eliminated player to ready up**, then
  calls the exact same `beginNextLevel()` the old keypress flow used, so
  the boss-stage alternation/announcement logic downstream is completely
  unaffected.
- **Eliminated players get a permanently-ready "OUT" panel** - stays in
  its slot (dimmed border), never interactive, and is excluded from the
  all-ready gate by construction (`panel.eliminated || panel.ready`) so
  an already-out player can never stall the other three.
- Row states: `OWNED` (jade, matches the existing scrap-pickup color),
  an affordable cost in plain text, or a dimmed cost when the player
  can't afford it yet - all three always visible, per the confirmed
  "show locked upgrades, don't hide them" design.

One real bug caught by the live verification pass, not just trusted on
paper: the eliminated branch of `buildShopPanel` returned early without
ever calling `refreshShopPanel`, so an "OUT" player's panel border
rendered but the "P2 / OUT" label stayed blank - fixed by calling it
before the early return. A second, cosmetic-only issue found the same
way: Phaser left-aligns multi-line text by default, so "P2" (narrower)
sat visibly left of "OUT" (wider) within the centered panel - fixed with
an explicit `align: 'center'` on that Text style.

Verified: `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`
(148/148, +4 for `nextShopCursor`) all clean. Confirmed live against the
running dev server (temporarily exposed the `Phaser.Game` instance on
`window`, reverted immediately after - `git diff` on `main.ts` is
clean): started a Cooperative round, force-eliminated P2 to exercise the
OUT-panel path, forced a stage clear, drove P1's real keyboard input
(WASD+Space) to cycle the cursor and buy Heavy Shot (scrap 20 -> 15,
`OWNED` state confirmed live), toggled P1 ready, and confirmed the
round actually advanced (`state` transitioned to `bossAnnouncement`,
`this.shop` cleaned up to `undefined`) the instant the last
non-eliminated player readied up - the eliminated P2 never blocked it.

---

## 2026-08-27 — Weapon upgrade system: Splitshot, Rapid Fire, Heavy Shot

Not originally scoped; requested directly with a full spec (three
upgrades, composable stacking, Scrap-funded shop hooks, no shop UI).
Scoped down from `docs/roadmap.md`'s speculative "Salvage" Weapons tree
(rapid fire, heavy cannon, ricochet, mines, plasma balls, Engines tree)
to just these three, confirmed via `AskUserQuestion` on four load-bearing
forks before writing any code, then verified live against the running
dev server.

**Base weapon vs. upgrades, separated per the brief**: every player
starts on the plain base weapon (`PROJECTILE`, unchanged). Each upgrade
is a one-time per-player unlock living on `PlayerSlot.weapon` (not
`Ship` - `ship` gets destroyed/replaced on every respawn and every stage
transition, `weapon` must survive both, same requirement Scrap itself
already met by living on the slot).

- **`systems/WeaponUpgrades.ts`** (new, pure, unit-tested) - the
  composability core. `computeShotSpecs(state, shipHeading, config)`
  turns a player's active-upgrade set into the actual list of shots one
  trigger-pull fires: Splitshot decides *how many* (1 or a 3-way fan,
  `WEAPON_UPGRADES.splitshot.spreadRad` - 12° each side, configurable),
  Heavy Shot decides *what stats* each shot has (radius/speed/damage/
  impulse, overriding the base weapon's numbers rather than stacking on
  top - the brief's own SPLITSHOT+HEAVY SHOT example). The two are
  independent axes, so every stacking combination (any subset of the
  three) falls out of this one function with no per-combination
  branching - Rapid Fire doesn't even appear here, it only changes fire
  *cadence* (`computeFireCooldownMs`) and the on-screen-shot cap
  (`computeMaxOnScreenShots` - confirmed via `AskUserQuestion`: Splitshot
  triples a player's own cap, so a 3-pellet volley isn't silently
  throttled by `SHIP.maxOnScreenShots`, a number picked before upgrades
  existed).
- **`systems/WeaponHeat.ts`** (new, pure, unit-tested) - Rapid Fire's
  "optional but recommended" heat system, built and on by default
  (`WEAPON_UPGRADES.rapidFire.heat.enabled`, one flag to disable
  entirely). Heat is added once per trigger-pull, not per Splitshot
  pellet - confirmed as a deliberate call (documented in both the config
  and the module itself): equipping Splitshot doesn't silently triple
  Rapid Fire's heat cost, since a 3-pellet volley is one weapon
  discharge. Decays every frame regardless of firing state, including
  underneath an active overheat lockout.
- **`systems/WeaponShop.ts`** (new, pure, no Phaser/UI dependency at
  all, per "weapon logic should be separated from UI and shop logic") -
  `canAfford`/`purchaseUpgrade`, the actual "shop should support"
  bullets from the brief (afford-check, deduct, apply, one-time unlock).
  `GameScene.purchaseWeaponUpgrade(slotIndex, upgradeId)` is the thin
  public wrapper - "the required interfaces/hooks for the shop," no shop
  scene built, per the brief's own explicit scope limit.
- **`Projectile`** gained optional `radius`/`speed`/`damage`/
  `kineticImpulse` constructor params (all defaulting to today's exact
  base-weapon values) - Heavy Shot is the same class with different
  numbers, not a new entity, matching "the upgrade should modify the
  existing weapon."
- **Damage, scoped to bosses only** (confirmed via `AskUserQuestion`):
  asteroids and the UFO already die in exactly one hit regardless of
  damage, so Heavy Shot's damage bonus has nowhere to go there.
  `FractureCombat.applyHit`/`CardinalCombat.applyHit` (and the
  entity-level `takeHit`/`takeArmHit`/`takeCoreHit` methods that call
  them) gained an optional `damage = 1` parameter, fully backward
  compatible with every existing call site and test - Heavy Shot passes
  `projectile.damage` (4, vs. the implicit 1 every other hit deals) and
  chews through Fracture/Cardinal HP proportionally faster.
- **Kinetic impulse, area effect confirmed via `AskUserQuestion`**
  ("push asteroids... if supported by the game," reaching nearby
  debris, not just the asteroid directly destroyed):
  `computeImpulseVelocity` (pure, unit-tested) falls off linearly from
  full strength at the impact point to zero at
  `WEAPON_UPGRADES.heavyShot.impulseRadius` (90px). A target essentially
  at the impact point (a freshly split child, spawned exactly at its
  parent's death position) gets pushed along the shot's own heading -
  "SHIP -> HEAVY SHOT -> ASTEROID -> NEW DIRECTION," the brief's own
  example; anything else caught in the radius gets pushed radially
  outward instead, reading as a shockwave.
  `GameScene.applyHeavyShotImpulse` applies this directly to each
  candidate's Matter velocity (a one-time add, not `applyForce` - see
  the new method's own doc comment on why a direct velocity nudge is the
  right primitive for a one-time "impulse" vs. `applyForce`'s gotcha,
  tuned for sustained per-frame forces). Runs after `destroyAsteroid`'s
  own split children are already in `this.asteroids`, so one loop
  covers both cases.
- **Suggested costs landed as specified**: 5 Scrap each
  (`WEAPON_UPGRADES.costs`), spent from `PlayerSlot.scrap` (the same
  currency Fracture/Cardinal scrap pickups already fund).

Verified: `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`
(144/144, up from 108 - 30 new cases across
`weaponUpgrades`/`weaponHeat`/`weaponShop`.test.ts plus 4 added to the
existing Fracture/Cardinal combat tests for the new `damage` param) all
clean. Confirmed live against the running dev server (temporarily
exposed the `Phaser.Game` instance on `window`, reverted immediately
after - `git diff` on `main.ts` is clean): purchased all three upgrades
on a live player (correct Scrap deduction, correct rejection of a
repeat purchase and an invalid slot), held fire with all three stacked
and confirmed exactly 12 heavy (`radius:7, damage:4, kineticImpulse:1.5`)
projectiles in three-per-volley ±12° fans up to the Splitshot-scaled
cap, watched heat accumulate, and destroyed a real asteroid with a
simulated Heavy Shot hit to confirm the kinetic push actually lands on
Matter velocity.

Two live-rendered mockups (Splitshot's 3-way fan, Heavy Shot's larger/
tinted projectile next to a normal shot) were reviewed and approved
before any of this was written, per direct request.

---

## 2026-08-27 — Every stage transition now clears UFOs and returns ships home

"After each completed Stage, reset the new stage - no UFO and default
number of rocks, ships of all players at home location," per direct
request. `resetStageHazards()` already cleared leftover asteroids/Black
Holes at every stage-begin point (`beginNextLevel()`'s normal-wave
branch, `materializeFracture()`, `materializeCardinal()`) - extended in
place rather than adding parallel call sites, so this applies to every
stage transition automatically, including into and out of a boss fight
(confirmed via `AskUserQuestion`).

- **No UFO**: any UFO(s) and their in-flight shots still alive from the
  stage/fight that just ended are destroyed (`ufo.destroy()`/
  `shot.destroy()`, not just spliced from the array - avoids orphaned
  Matter bodies). Doesn't touch the UFO's own periodic spawn timer for
  the *new* stage - one can still appear again once that timer's up,
  same as always.
- **Default number of rocks**: confirmed via `AskUserQuestion` that
  `ASTEROID.spawnCountPerWave + ASTEROID.waveGrowthPerLevel` (a flat
  formula, not a per-stage-count ramp) was already the intended
  "default" and needed no change - this request was about clearing
  leftovers, not the count itself.
- **Ships home**: every player whose ship is currently alive is
  teleported back to their own spawn point (`spawnOffsetFor()`, the
  same corner-diamond/dead-center offset round start and death-respawn
  already use) via a fresh `Ship` instance (old one explicitly
  `destroy()`'d first) with `SHIP.respawnInvulnerabilityMs` of
  invulnerability - a fresh wave's rocks can spawn right on the home
  diamond, and a player didn't do anything wrong to deserve dying for
  it. Deliberately skips any player whose ship isn't alive right now
  (eliminated, mid-respawn-delay, or - Cooperative - currently a
  drifting/being-towed Commander instead of a ship) - each of those
  already has its own place that positions them correctly without this
  method's help, and resetting them here would be a bug (e.g. spawning
  a duplicate ship for a player who's mid-rescue as a Commander).

Verified: `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`
(108/108) all clean. Confirmed live against the running dev server -
temporarily exposed the `Phaser.Game` instance on `window` (reverted
immediately after, `git diff` on `main.ts` is clean), drove a real
Cooperative round to the `GameScene`, manually displaced both ships
off their home position and spawned a UFO, then called
`resetStageHazards()` directly: UFO count 1 → 0, both ships' positions
snapped back exactly to their spawn-diamond coordinates, both flagged
invulnerable immediately after.

---

## 2026-08-26 — Menu music swapped to asteroid-field.mp3

One-line change, on request: `systems/Music.ts`'s `MENU_MUSIC_URL` now
points at `asteroid-field.mp3` (already sitting in `debris/music/`,
same as every other track) instead of `menu.mp3`. `MENU_MUSIC_KEY`
itself is unchanged, so no other call site (`SplashScene`/`MenuScene`/
`GameScene`'s own `stopSound(this, MENU_MUSIC_KEY)`) needed touching.

Verified: `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (108/108)
all clean; `npm run build` clean; confirmed `asteroid-field.mp3` itself
serves (`200`) via the user's own dev server.

---

## 2026-08-26 — Boss-fight respawns + Space Station relocate to a corner

### What was built

"During boss fights the respawn point needs to be out of boss position,"
per direct request - both bosses live at or near arena-center, exactly
where the normal respawn/drop-off points already are.

- **Player respawns**: `GameScene.spawnOffsetFor()` now checks
  `isBossEncounterActive()` first - during a boss fight, every mode with
  a lives/respawn system (Competitive, Single Player) spawns in one of 4
  fixed screen corners (new `BOSS_CORNER_POSITIONS`, same P1/P2/P3/P4
  quadrant order `PLAYER_HUD_CORNERS` already uses) instead of the usual
  small center-diamond (`PLAYER_SPAWN_OFFSETS`) or Single Player's
  dead-center spawn. "Per-player corners," decided over clustering
  everyone at the bottom edge.
- **Space Station** (Cooperative's rescue drop-off, previously fixed at
  arena-center for the whole round): now relocates to a random corner
  right as a boss's announcement starts, and travels back the moment the
  stage actually clears. "Make the move visible," decided - `SpaceStation`
  gained a real `travelTo(target, nowMs, durationMs)`, an eased glide
  (ease-in-out cubic, `SPACE_STATION.relocateTravelMs` = 2.5s) rather
  than a teleport. `position` is a live getter now instead of a fixed
  field set once in the constructor, so every existing distance check
  that already reads it (drop-off range, a rescued player's respawn
  point, Black Hole spawn clearance) stays correct through the glide
  automatically, no call site changes needed. A new
  `spaceStationRelocated` flag gates the return trip so every stage-clear
  doesn't need to separately ask "was that a boss stage" - it only
  travels home if it's actually away.
- Both share `BOSS_CORNER_POSITIONS` (absolute arena positions, inset
  220px from the true screen corners) so the respawn points and the
  Space Station's own relocation targets can never drift apart.

Also checked, on request: the boss-stage music switching from the
earlier cross-boss-conventions work. Traced every call site
(`materializeFracture()`/`materializeCardinal()` calling `playStageMusic()`
with the right keys, the normal-wave branch swapping back, the no-op
guard) - the logic is correct. Couldn't confirm by ear (no browser tool
in this environment).

### Verified

- `npx tsc --noEmit`, `npx eslint .` clean.
- `npx vitest run` - 108/108, unchanged (Phaser positioning/timing logic,
  no new pure logic to unit test).
- `npm run build` - clean production build.
- Transpile smoke check against the user's own already-running dev
  server (port 5173): curled every changed file - `200` each.

### Not done yet

No in-browser confirmation that the corner spawns/Space Station glide
actually read as clear of both bosses' danger zones, or that the glide
itself looks right (no browser tool in this environment) - for the user
to check against their own live dev server. The music-switching check
above is code-review-only, not an audible confirmation. Not
deployed - `debris/game` only.

---

## 2026-08-26 — Black Hole retiming: 2-minute stage grace period, shorter uptime, approach warning

### What was built

"Make black hole appear not before 2 min into any stage. This will give
the players time to clear the rocks first. Black holes will stay for 15
seconds, then disappear. 5 seconds before black hole appears play sound
black-hole-approaching.mp3" - three changes to `BLACK_HOLE`
(`GameConfig.ts`) and its spawn-check in `GameScene.update()`.

- **2-minute stage grace period**: new `BLACK_HOLE.minStageElapsedMs`
  (120000). The spawn check now takes whichever is more restrictive of
  the existing 60-second post-despawn pause and this new stage-relative
  floor, measured against `stageElapsedMs` - which already resets to 0
  at every stage transition (the earlier stage-fresh-reset work), so
  every stage gets its own fresh 2-minute window with no new timestamp
  to track.
- **Shorter active duration**: `activeDurationMs` 30000 → 15000.
  `pauseDurationMs` (60s) is unchanged - not mentioned in the request.
- **5-second approach warning**: new `BLACK_HOLE.approachWarningMs`
  (5000). The spawn check now computes *remaining time until eligible*
  (for both the pause and the stage-grace gates) rather than only a
  boolean "eligible yet," and plays a new one-shot SFX,
  `black-hole-approaching.mp3` (a file the user had already dropped into
  `debris/music/`), exactly once per upcoming spawn - a new
  `blackHoleWarningPlayed` flag resets at round start, every stage
  transition (`resetStageHazards()`), and right after a black hole
  actually spawns, so the next cycle later in the same stage can warn
  again.
- **New `systems/Music.ts` entry**: `BLACK_HOLE_APPROACHING_SFX_KEY`/
  `_URL` - grouped with the music tracks rather than `systems/Sfx.ts`,
  since the file lives in `debris/music/` (Vite's publicDir) like the
  other tracks there, not bundled via ES import like `Sfx.ts`'s own
  keys; played as a one-shot (`this.sound.play`, not `playLoopingSound`)
  at the call site despite living in the same file as the loop tracks.

### Verified

- `npx tsc --noEmit`, `npx eslint .` clean.
- `npx vitest run` - 108/108, unchanged (a GameConfig retune + a
  GameScene timing/SFX change, no new pure logic to unit test).
- `npm run build` - clean production build.
- Transpile smoke check against the user's own already-running dev
  server (port 5173): curled every changed file - `200` each - plus a
  direct check that `black-hole-approaching.mp3` itself actually serves
  - `200`.

### Not done yet

No in-browser confirmation that the warning fires at the right moment
or that 2 minutes actually feels like enough clearing time in practice
(no browser tool in this environment) - for the user to check against
their own live dev server. Not deployed - `debris/game` only.

---

## 2026-08-26 — Stage-fresh reset + scrap pickup redesign ("floating parts")

### What was built

Two separate requests, landed together.

**Stage-fresh reset**: "after every stage and bossfight, start the stage
fresh - remove all Black Holes and reset rock count," decided, scoped
specifically to *stage* transitions, not a whole-round reset (`create()`
already has its own separate reset block for that). New
`GameScene.resetStageHazards(nowMs)` - clears the `asteroids` array and
force-despawns an active Black Hole - called from all three stage-begin
points (`beginNextLevel()`'s normal-wave branch, `materializeFracture()`,
`materializeCardinal()`) right before that stage's own `spawnWave()`.
The asteroid clear is mostly belt-and-suspenders (stage-clear already
requires it to be empty), but the Black Hole despawn is a real fix: one
can still be actively alive at the exact instant the last asteroid of a
stage dies (its own timer runs independently of asteroid count), and
would otherwise carry over ticking into the next stage untouched.

**Scrap pickup redesign**: "it looks like rocks, it needs to look like
floating parts, make them pulse slightly" - a live mockup comparison
(old jagged-shard look vs. several redesign directions, then a
tetromino-shape request, then a size check against the small asteroid,
then a 3-way color comparison) landed as:

- **Shape**: `entities/FractureSwarmBit.ts` now renders one of the 7
  standard tetromino layouts (I/O/T/S/Z/J/L), picked randomly per spawn
  and scaled to a consistent footprint regardless of that shape's own
  natural bounding box (a 4-wide I-piece and a 2x2 O-piece both read as
  "the same size class") - replacing `generateAsteroidPoints`'s jagged
  rock silhouette entirely.
- **Material/color**: dark metal plating (`COLORS.cardinalFill`, reused
  rather than a new fill) with a pulsing muted-jade glow - new
  `COLORS.scrap` (`#4fae82`), picked after comparing gold/copper/jade
  candidates live. Pure green was ruled out outright: too close to
  Player 4's own acid-green (`COLORS.players[3]`), same class of
  conflict that pushed The Cardinal off Player 1's cyan earlier.
  "Glow" is Phaser's usual layered-flat-fills stand-in (a soft, larger,
  low-alpha rect behind the solid cell) - `Graphics` has no true blur,
  same technique The Fracture's own core glow and Black Hole already use.
- **Pulse + motion**: a ~1.4s scale-breathing cycle layered on top of
  the existing materialize fade/scale-in, plus a small floating bob
  (drawn only, not physically applied) on top of the existing spin and
  straight-line drift - "floating, not flying."
- **Size**: "smaller than or the same size as the little rocks," decided
  - `FRACTURE.swarmRadius` shrunk from 12 (24px across, bigger than the
    smallest asteroid's own 16px) to 7 (14px, safely under it).
- Reused as-is by The Cardinal's own arm-scrap (`processPendingCardinalArmHits`),
  so this redesign applies to both bosses' scrap identically with no
  extra work.

### Verified

- `npx tsc --noEmit`, `npx eslint .` clean.
- `npx vitest run` - 108/108, unchanged (this is Phaser rendering + a
  small GameScene reset helper, no new pure logic to unit test).
- `npm run build` - clean production build.
- Transpile smoke check against the user's own already-running dev
  server (port 5173): curled every changed file - `200` each.

### Not done yet

No in-browser confirmation of the pulse timing/bob amplitude feel, or
that the Black Hole/rock reset is actually unnoticeable in normal play
(it's designed to be invisible when nothing was carrying over) - for the
user to check against their own live dev server. Not deployed -
`debris/game` only.

---

## 2026-08-26 — The Cardinal (Debris's second boss) + random boss-stage rotation

### What was built

Full implementation of The Cardinal, following the design spec + visual
mockup reviewed and approved across the last several turns
(`docs/roadmap.md`'s "The Cardinal" section, item 22 for the landed
summary) - a permanent four-armed rotating fixture at exact arena-center,
three phases, plus the random-per-stage boss-pool structure needed to
actually reach it in a real playthrough.

- **New `systems/CardinalCombat.ts`** (pure, tested): `applyHit(hp)` -
  same shape as `FractureCombat.ts`'s own, kept as a separate module per
  boss rather than a shared import - and `determinePhase(armsAlive,
  coreDestroyed)`, resolving the three-phase state
  (`armed`/`coreExposed`/`critical`). 10 new tests
  (`tests/cardinalCombat.test.ts`).
- **New `entities/Cardinal.ts`** - the boss itself. Deliberately **not
  Matter-backed at all**, unlike The Fracture: a rotating cross with
  four independently-destructible hit zones doesn't fit Matter's
  category/mask model, so it owns one plain `Graphics` visual (the whole
  body rotated as a single rigid transform via `setRotation`, each arm
  drawn once in local space at a fixed 0/90/180/270 offset) and exposes
  pure query methods (`isArmAlive`, `armAngleRad`, `isLaserActiveForArm`,
  `phase`, HP fractions, detonation progress) that `GameScene` hit-tests
  against every frame via plain distance/segment math - the same "plain
  math hazard" pattern `BlackHole` and `FractureLaser` already
  established. The laser's own charge/fire/fade cycle lives entirely
  inside this class (never random-angle like Fracture's laser - it's
  always "wherever the arms currently point"), so GameScene only ever
  *asks*, never triggers, that half of its attacks.
- **New `entities/CardinalPlasmaBall.ts`** - the one exception, a normal
  small Matter-backed projectile (own `CATEGORY.CARDINAL` mask, sensor
  vs. ship), same shape as `FractureShard`.
- **`GameConfig.ts`**: new `CARDINAL` block (arm/core HP, reach, timing,
  scores - every number not explicitly "decided" by the brief is a
  proposed starting point, same caveat the design spec itself carried),
  new `COLORS.cardinal`/`cardinalFill` (a teal shifted off Player 1's
  exact cyan, per the earlier color decision), `UFO.maxConcurrentDuringBoss`
  wired into the earlier boss-stage-conventions work.
- **`GameScene.ts`** (the bulk of the integration):
  - **Phase 1 - Armed**: each arm's own 20 HP
    (`pendingCardinalArmHits`/`processPendingCardinalArmHits`) -
    destroyed independently, explodes into scrap (reuses
    `FractureSwarmBit`, pushed into the existing `fractureSwarm`
    array/pickup flow rather than a new one - the pickup resolution
    doesn't care which boss dropped it, and Cardinal's scrap
    deliberately never calls `beginScrapCountdown()` so it has no
    expiry, matching "collectible until the boss finally exploded").
    Ram hazard is the core only, not the arms (`updateCardinalAttacks`).
    A single consolidated health bar (`createCardinalHealthBar`/
    `updateCardinalHealthBar`, a `Rectangle` fill using the same
    left-anchored-origin pattern `MenuScene`'s own volume sliders
    already use) sums all 4 arms below the boss.
  - **Phase 2 - Core exposed**: `pendingCardinalCoreHits`/
    `processPendingCardinalCoreHits` for the core's own 20 HP; a plasma
    ball fires at the nearest player every 2 seconds
    (`Cardinal.canFirePlasma`/`recordPlasmaFired`, lead-aim reusing
    `systems/UfoTargeting.ts`, same math the UFO's own shot uses).
  - **Phase 3 - Critical**: `resolveCardinalDetonation` - a large lethal
    blast radius (`CARDINAL.detonationMaxRadius`) once the 5-second
    countdown (rendered inside the core by `Cardinal` itself, plus a
    danger ring that grows in real time to its full radius exactly as
    the timer hits zero) runs out; clears any uncollected arm-scrap at
    the same moment.
  - **`isBossEncounterActive()`** (renamed from
    `isFractureEncounterActive`, per the earlier cross-boss-conventions
    entry) now also covers `this.cardinal !== undefined`.
  - **The boss-stage rotation, now actually implemented**: the old
    `fractureIntroduced` one-time latch is gone, replaced by
    `lastStageWasBoss` - `beginNextLevel()` triggers a randomly-picked
    boss (`pickRandomBoss()`, 50/50 today) after every normal stage
    clear, and a normal wave after every boss's own clear, alternating
    for the rest of the round. `beginFractureAnnouncement()` generalized
    into `beginBossAnnouncement(boss)`, dispatching to
    `materializeFracture()` or the new `materializeCardinal()`.
- **Available in all three modes** - Single Player, Cooperative,
  Competitive alike, per the earlier mode-availability decision. A ship
  killed by any Cardinal attack in Cooperative routes through the
  existing Emergency Ejection & Rescue system like any other hazard, no
  special-casing needed.

### Verified

- `npx tsc --noEmit`, `npx eslint .` clean (one real `tsc` catch along
  the way: a literal-type comparison in `coreHpFraction()` TypeScript
  correctly flagged as always-false, since `CARDINAL.coreHp` is a `const`
  literal `20` - removed the dead guard rather than silencing it).
- `npx vitest run` - 108/108 (was 101; +7 new `cardinalCombat.test.ts`
  cases).
- `npm run build` - clean production build (67 modules, was 64).
- Transpile smoke check against the user's own already-running dev
  server (port 5173): curled every new/changed file - `200` each. Also
  confirmed a dead-config sweep - every single `CARDINAL.*` constant is
  actually referenced somewhere in the new code, nothing left over from
  the design-spec phase that never got wired in.

### Not done yet

No in-browser playthrough of an actual Cardinal fight (no browser tool
in this environment) - static verification only, for the user to check
against their own live dev server: watch the rotation, get an arm
destroyed and confirm the scrap/cross-degrading/health-bar all track
correctly, clear all four arms and confirm the plasma-ball phase kicks
in with the right cooldown/targeting, and confirm the Phase 3 countdown
ring/detonation actually kills a ship caught inside it. The three
"still open" tuning questions from the design spec remain genuinely
open (instant-kill vs. heavy-damage framing for the Phase 3 blast,
exact numeric tuning beyond what's now hardcoded as a starting point,
plasma-ball lead-aim vs. straight-shot feel in practice) - built with a
reasonable default for each, not re-litigated here. Not deployed -
`debris/game` only.

---

## 2026-08-26 — Cross-boss stage conventions (announcement, hazard suppression, UFO cap, music)

### What was built

Requested directly, ahead of The Cardinal (or the random per-stage boss
pool, `docs/roadmap.md`'s "Bosses" section) actually being built: four
rules meant to apply to *every* boss stage, current and future, written
generically now even though The Fracture is still the only trigger that
exists in code.

- **Boss name announcement, generalized.** `GameScene`'s
  `showFractureAnnouncement()` (hardcoded "THE FRACTURE" text) is now
  `showBossAnnouncement(name: string)`, called today as
  `showBossAnnouncement('THE FRACTURE')` from `beginFractureAnnouncement()`.
  Ready to take `'THE CARDINAL'` the moment that boss has an actual
  trigger of its own.
- **No Black Holes during a boss stage** - already true for The
  Fracture; the gate (`isFractureEncounterActive()`) is renamed to
  `isBossEncounterActive()`, generic rather than Fracture-specific, so
  it reads correctly once a second boss exists, even though it's still
  only ever true for The Fracture today.
- **Boss stages cap concurrent UFOs at 4** - new
  `UFO.maxConcurrentDuringBoss` (`GameConfig.ts`), the one exception to
  the existing "no cap on concurrent UFOs" rule for normal play (item
  4's own decision, untouched). Gated by the same
  `isBossEncounterActive()` check; deliberately doesn't reset
  `lastUfoSpawnAtMs` while capped, so a new UFO spawns immediately once
  a slot frees up if the interval had already elapsed, rather than
  waiting a fresh full interval from whenever the cap happened to clear.
- **Per-stage-type looped music.** `systems/Music.ts` gained
  `FRACTURE_MUSIC_KEY` (`the-fractured.mp3`) and `CARDINAL_MUSIC_KEY`
  (`the-cardinal.mp3`, preloaded now even though nothing triggers it yet
  - The Cardinal has no entity/trigger in code). Normal stages keep the
  existing `GAMEPLAY_MUSIC_KEY` (`neon-horizon.mp3` - already the
  existing gameplay track, not a new asset). New
  `GameScene.playStageMusic(key)` swaps the currently-looping track,
  no-ops if it's already the requested one (so back-to-back normal
  stages never audibly restart the same song), called at every
  stage-begin point: `create()` (round start), `beginNextLevel()`'s
  normal-wave branch, and `materializeFracture()`. New
  `currentStageMusicKey` field tracks which track is actually live, so
  `enterPaused()`/`exitPaused()`/`goToMainMenu()` pause/resume/stop
  whichever track is really playing instead of always assuming gameplay
  music - pausing mid-Fracture-fight no longer leaks gameplay music back
  in on resume.
- Both new audio files were already sitting in `debris/music/`
  (user-supplied, same as the existing `menu.mp3`/`neon-horizon.mp3`) -
  no placeholder assets needed, just wiring.

### Verified

- `npx tsc --noEmit`, `npx eslint .` clean.
- `npx vitest run` - 101/101, unchanged (this is all Phaser scene/audio
  wiring, no new pure logic to unit test).
- `npm run build` - clean production build (64 modules, unchanged).
- Transpile smoke check against the user's own already-running dev
  server (port 5173): curled every changed file - `200` each - plus a
  direct check that all three music files (`the-fractured.mp3`,
  `the-cardinal.mp3`, `neon-horizon.mp3`) actually serve - `200` each.

### Not done yet

The random per-stage boss-pool structure itself (`docs/roadmap.md`'s
"Bosses" section) - today's single one-time Fracture trigger
(`fractureIntroduced` latch) is unchanged, so none of this is
exercisable for a second boss yet. The Cardinal has no entity/code at
all still, only its design spec + visual mockup - `CARDINAL_MUSIC_KEY`
is preloaded and ready, but nothing calls `playStageMusic(CARDINAL_MUSIC_KEY)`
or `showBossAnnouncement('THE CARDINAL')` anywhere yet. No in-browser
audio confirmation (no browser tool in this environment) - for the user
to check against their own live dev server. Not deployed - `debris/game`
only.

---

## 2026-08-25 — Dev-only stage timer

### What was built

Requested directly, explicitly a dev aid: "add a timer during stages on
the top center screen, shows minutes, seconds, milliseconds of current
stage, resets every stage." No ambiguity worth an `AskUserQuestion` here
- the request specified placement, format, and reset trigger outright.

- **New `utilities/StageTimer.ts`**: `formatStageTimer(elapsedMs): string`,
  a pure `MM:SS.mmm` formatter (no hour digit - stages never run that
  long), unit tested (`tests/stageTimer.test.ts`, 6 cases: zero,
  sub-second, seconds+ms, double-digit minutes, fractional-ms flooring,
  negative-input clamping).
- **`GameScene.ts`**: new `stageElapsedMs`/`stageTimerText` fields. A
  small `Text` sits just below the existing mode-label line at the top
  center. Accumulated in `update()` via `stageElapsedMs += deltaMs`,
  gated by the same `if (this.state !== 'playing') return;` the rest of
  gameplay-only logic already uses - deliberately *not* read off a raw
  `this.time.now` timestamp diff, since that keeps ticking through
  pause/overlays and would've needed its own separate resume-tracking
  logic to stay correct; accumulating only while actually playing gets
  the "pauses automatically" behavior for free across every non-playing
  state (paused, stage-clear overlay, the Fracture announcement,
  initials entry, game over) with no extra bookkeeping.
- **Resets to zero** at both of the game's actual stage-transition
  points: `beginNextLevel()` (the normal next-wave path out of "STAGE
  CLEARED") and `materializeFracture()` (the Fracture stage's own entry
  point, reached via the boss announcement instead). Also reset at
  round start (`create()`), same as every other per-round field.
- **`docs/roadmap.md`**: landed as item 21, plus - per the same
  request, "add to roadmap to remove the timer for final version" - an
  explicit "Not yet started" entry listing exactly what removal touches,
  so this doesn't get forgotten and accidentally ship.

### Verified

- `npx tsc --noEmit`, `npx eslint .` clean.
- `npx vitest run` - 101/101 (was 95; +6 new `stageTimer.test.ts` cases).
- `npm run build` - clean production build (64 modules, was 63).
- Transpile smoke check against the user's own already-running dev
  server (port 5173): curled both changed/new files - `200` each.

### Not done yet

No in-browser confirmation of on-screen placement/legibility (no
browser tool in this environment) - for the user to check against their
own live dev server. Not deployed - `debris/game` only. This feature is
explicitly temporary; see the roadmap's removal note above.

---

## 2026-08-25 — Separately-tracked high scores for Cooperative and Competitive

### What was built

Direct follow-up, requested on the spot: what the previous entry's
roadmap note left as open questions ("what would even be ranked,
per-mode vs. shared board") - resolved and implemented, extending the
Single-Player-only leaderboard system to all three modes, each tracked
independently.

- **Backend (`debris-highscore-api`)**: `leaderboard.ts` gained
  `VALID_MODES`/`Mode`/`isValidMode` and `filePathForMode(basePath, mode)`
  - Single Player keeps its existing unsuffixed file path (no migration
  risk to already-live data), Cooperative/Competitive each get a sibling
  `-cooperative`/`-competitive.json` file. `server.ts`'s `GET`/`POST
  /highscores` now read `mode` from the query string / JSON body,
  400-ing on anything not in `VALID_MODES`. Caught and fixed before
  shipping: the route dispatcher's `req.url === '/highscores'` exact
  match would've broken the moment `GET` requests carried a `?mode=`
  query string - now splits off the query string before comparing.
  5 new tests in `leaderboard.test.ts` (17/17 passing).
- **`systems/HighScoreApi.ts`**: `fetchLeaderboard`/`submitHighScore`
  both now require a `mode: GameMode` argument, threaded into the query
  string / POST body.
- **`MenuScene.ts`**: one leaderboard panel per mode
  (`leaderboardPanels`/`leaderboardCaches`, both `Record<GameMode, ...>`,
  replacing the old single-panel fields), each built by a new
  `createLeaderboardPanel(mode, centerX, top, width)` and aligned under
  its own mode-toggle button (extending the previous entry's Single
  Player alignment fix to all three). `refreshModeButtons()` shows only
  the active mode's panel and fetches for that mode alone.
- **`HighScoreScene.ts`**: takes a `mode` param via `init()`; headline
  changed from a single "HIGH SCORES" title to `GAME_MODE_LABELS[mode]`
  as the big title with "H I G H   S C O R E S" as a smaller subtitle
  beneath it - "change the headlines of all 3 accordingly: game mode,
  and below keep High Scores," decided.
- **`GameScene.ts`**: the initials-entry flow (previously hardcoded to
  Single Player) is now one shared path parameterized by
  `mode`/`input`/`baseOverlayLines`, reused by all three round-outcome
  branches (`finishSinglePlayerRound`, new `finishCompetitiveRound`, new
  `finishCooperativeRound`) instead of duplicating the UI/update/confirm
  flow three times. **Who enters initials**, resolved via
  AskUserQuestion: Single Player, the player themself; Competitive, the
  winner (`winner.input`); Cooperative, whichever player was still alive
  last. Cooperative needed a new field for this -
  `evaluateRoundOutcome` never actually returns an "alive at round end"
  state for Cooperative (only `loss` or `continue`, since the mode has
  no win condition at all), so "last standing" is tracked instead as
  "last eliminated" via a new `lastEliminatedSlotIndex`, set at both of
  Cooperative's own elimination call sites
  (`processCommanderExpiry`, `processPendingCommanderHazardHits`).
- **Docs**: `docs/gameplay.md` gained a "Global high scores" section (a
  table of what's ranked and who enters initials, per mode) replacing
  the old Single-Player-only bullet; `docs/art_direction.md`'s "Arcade
  Marquee" entry and mode-toggle bullet updated for the three-panel/
  mode-headline treatment; `DEPLOYMENT.md`'s PVC description updated to
  mention three leaderboard files instead of one.

### Verified

- `debris/highscore-api`: `npx tsc --noEmit`, `npx eslint .` clean;
  `npx vitest run` 17/17. Manual `curl` smoke test on an isolated port
  and temp data directory (after finding and killing a stray leftover
  server process from earlier in the session that was silently
  answering on the port first chosen for this, which would otherwise
  have made the test look like it passed against stale code): confirmed
  400s on missing/invalid `mode`, and that all three modes read/write
  genuinely separate files.
- `debris/game`: `npx tsc --noEmit`, `npx eslint .` clean; `npx vitest
  run` clean (existing `highScoreApi.test.ts` call sites updated to pass
  a mode); `npm run build` clean.
- Transpile smoke check against the user's own already-running dev
  server, same as the previous entry.

### Not done yet

No in-browser confirmation of the three-panel menu layout or the
Cooperative/Competitive initials-entry flow end-to-end (no browser tool
in this environment) - static verification only, for the user to check
against their own live dev server. Not deployed - `debris/game` and
`debris/highscore-api` only.

---

## 2026-08-25 — TOP 3 panel aligned to the Single Player button

### What was built

Direct follow-up: the previous entry's panel resize/reposition attempts
were only ever shown as HTML mockup previews, which turned out to be an
unreliable way to verify this - three preview iterations in a row still
didn't land right (a center-vs-top-left origin mix-up in one, a
container-query font unit that may not have resolved at all in another,
and a final one the user reported simply "does not work"). Rather than
keep iterating on approximations, made the actual change directly in
`MenuScene.ts` this time and verified it the normal way (tsc/eslint/
tests/build), for the user to check live against their own
already-running dev server (Vite HMR) instead of another mockup.

- **`MenuScene.createModeToggle()`**: the mode-button loop now captures
  `singlePlayerCenterX` (the Single Player button's own center-x) as it
  builds the row. The leaderboard panel's width and center-x are now
  literally `width` (the same constant every mode button already uses)
  and `singlePlayerCenterX` - not `360` and `ARENA_WIDTH / 2`, two
  independent numbers with no relationship to anything else on screen.
  "Top 3 box aligned with single player box," decided - the panel now
  reads as belonging to that specific button (same edges) rather than a
  separately-floating box that happened to be centered on the same
  screen.
- Vertical position/height/fonts inside the panel are unchanged from
  the previous entry - only the width and horizontal position moved.

### Verified

- `npx tsc --noEmit` - caught a real mistake along the way (a
  `let singlePlayerWidth` that was never actually reassigned, since
  every mode button already shares the same `width` constant - `eslint`
  flagged it, removed rather than silenced).
- `npx eslint .`, `npx vitest run` (95/95, unchanged) - clean.
- `npm run build` - clean production build (63 modules).
- Transpile smoke check against the user's own already-running dev
  server (port 5173): curled the changed file - `200`.

### Not done yet

No in-browser confirmation this actually reads as aligned - only static
verification, no browser tool in this environment. This entry
deliberately skipped another mockup preview in favor of the user
checking the real, already-running page directly. Also added to
`docs/roadmap.md`'s "Future ideas" (requested separately, not built):
high score boxes for Cooperative and Competitive - genuinely open
questions there (what would even be ranked, per-mode vs. shared board),
not a small follow-up like this entry. Not deployed - `debris/game` only.

---

## 2026-08-25 — Fixed the top-3 panel overlap, added click support to HighScoreScene

### What was built

Direct follow-up against the previous entry, reported with a screenshot:
the TOP 3 mode-select panel's hint text ("CLICK FOR FULL LEADERBOARD")
visually overlapped the 3rd score row. Two changes, one bug fix and one
requested addition - `AskUserQuestion`d first on whether the panel's
click-to-open should stay at all (given the bug, the intent was
ambiguous from the report alone) - answer: keep it, just fix the overlap.

- **Layout bug fixed** (`MenuScene.ts`): the previous panel size/
  positions were a guess that didn't hold up against real measured text
  height once actually rendered - `panelHeight` 95 -> 100, and every
  child element (title/rows/hint) now stacked top-down from
  `leaderboardTop` with its own explicit offset, rather than the hint
  text being back-calculated from an assumed total content height that
  turned out wrong. Font sizes trimmed slightly (title 15->13px, rows
  16->14px, hint 12->11px, row `lineSpacing` 4->2) to fit the same
  ~115px vertical budget between the mode toggle and the player cards
  comfortably instead of exactly.
- **HighScoreScene's return prompt now also accepts a click**, on
  request - reverses the previous entry's deliberate choice to leave
  `pointerdown` out (that choice was reasoned through at the time to
  avoid the *opening* click bouncing straight back to the menu).
  Resolved without reintroducing that risk: `waitForKeyPress()` now
  delays attaching the `pointerdown` listener by `CLICK_GRACE_MS`
  (400ms, `this.time.delayedCall`) instead of wiring it up the instant
  the scene exists - the opening click is already fully dispatched to
  MenuScene before this scene is even created, so there's nothing here
  yet for it to hit. Prompt text updated to "PRESS ANY KEY OR CLICK TO
  RETURN" to match.

### Verified

- `npx tsc --noEmit`, `npx eslint .` - clean.
- `npx vitest run` - 95/95 passing, unchanged (layout/input wiring, no
  new pure logic).
- `npm run build` - clean production build (63 modules).
- Transpile smoke check against the user's own already-running dev
  server (port 5173): curled both changed files - `200`.

### Not done yet

No in-browser confirmation the overlap is actually gone or that the
400ms click-grace window feels right (too short still risks the bounce,
too long reads as unresponsive) - only static verification, no browser
tool in this environment. Not deployed - `debris/game` only.

---

## 2026-08-25 — High score screen (80s arcade style) + game-over goes to main menu

### What was built

Two related, directly-requested changes to the round-end/menu flow.

- **Leaderboard trimmed to top 3 on the mode-select screen**
  (`MenuScene.ts`) - was a two-column top-10 (`leaderboardLeftText`/
  `leaderboardRightText`), now a single centered column
  (`leaderboardText`) inside a bordered, clickable panel
  (`leaderboardBorder`), same `Rectangle` + `Text` + `pointerdown`
  "button" pattern every other interactive element on this screen
  already uses. The panel disables/re-enables its own interactivity
  alongside its visibility (only live while Single Player is selected).
- **New `HighScoreScene`** (`scenes/HighScoreScene.ts`, new file,
  registered in `main.ts`'s scene list) - "looks like the Highscore
  screen of an 80s arcade, but in the style and colors of Debris,"
  decided. Full top 10, one centered monospace column, rank 1 biggest
  and gold (reusing `COLORS.fractureLauncher`, not a new color), ranks
  2-3 a step down in white, the rest in the same grey every other body
  text on the screen uses. Title reuses the start screen's own "DEBRIS"
  glow treatment (white fill, Player 1 cyan stroke + `setShadow`)
  rather than inventing a second logo style. Gets the game's existing
  viewport-level CRT overlay for free, like every other scene - nothing
  scene-specific needed for that half of "80s arcade." Receives
  MenuScene's already-fetched leaderboard via `init(data)` for an
  instant render, then re-fetches for freshness the same way MenuScene's
  own leaderboard already does.
  - **"Any key to return," implemented as keyboard/gamepad only,
    deliberately no `pointerdown`** - unlike GameScene's own
    `waitForKeyPress`. This scene is only ever *entered* by a click (the
    mode-select panel), so accepting clicks here too risked that same
    click bouncing straight back to the menu it just came from - not
    guessed at, reasoned through before writing the code, since nothing
    else in this codebase had exercised "register a pointerdown listener
    in `create()` of a scene that was itself just opened by a
    pointerdown" before.
- **GAME OVER no longer restarts, it returns to the main menu**
  (`GameScene.enterGameOver()`) - was `scene.restart({ mode: this.mode
  })`, now `goToMainMenu()`, the exact same cleanup (stops gameplay
  music/thrust sound) the pause menu's own "MAIN MENU" button already
  used, reused rather than duplicated. Applies uniformly to every
  game-over path (Competitive win/draw/loss, Cooperative loss, Single
  Player loss with or without a qualifying high score) since they all
  funnel through that one method. All six "PRESS ANY KEY TO RESTART"
  overlay lines updated to "PRESS ANY KEY FOR MAIN MENU" to match - a
  stale prompt would have been actively misleading. The Pause menu's own
  explicit RESTART button is untouched - a deliberate manual restart is
  a different action from what happens automatically once a round ends.

### Verified

- `npx tsc --noEmit`, `npx eslint .` - clean (one real mistake caught by
  `tsc` along the way: naming a scene field `cache` collides with
  `Phaser.Scene`'s own built-in `cache` property/CacheManager - renamed
  to `entries`).
- `npx vitest run` - 95/95 passing, unchanged (scene/UI wiring, no new
  pure logic to extract).
- `npm run build` - clean production build (63 modules, up from 62).
- Transpile smoke check against the user's own already-running dev
  server (port 5173): curled every changed/new file - all `200`.

### Not done yet

No in-browser click-through of the actual flow (menu panel click ->
HighScoreScene -> any key -> back to menu; game over -> any key -> main
menu) - only static verification and a transpile check, no browser tool
in this environment. Not deployed - `debris/game` only.

---

## 2026-08-25 — Fixed a real crash: Fracture arrays updated before being filtered

### What was built

User report: "when hit by a golden shard, the game crashed / freezes."
Real bug, not a one-off - a repeat of a pattern this codebase already
hit and fixed once before (`GameScene.update()`'s own comment calls it
out by name: "This was the real 'crash when hitting a rock' bug").

`fractureFragments`/`fractureSwarm`/`fractureShards` were only filtered
by `isAlive` *after* their own `.update()` calls ran each frame, not
before, unlike every other entity array (`asteroids`, `projectiles`,
`shields`, `ufos`, `ufoShots`, `commanders`) which are filtered
immediately after pending-hit processing, specifically so an entity
destroyed this frame never has `.update()` called on its
already-destroyed Phaser GameObject. Since
`processPendingFractureShardHits`/`processPendingFractureFragmentHits`/
`processPendingScrapPickups` all run earlier in the same `update()` and
can destroy a shard/Fragment/Swarm bit, the later
`this.fractureShards.forEach((shard) => shard.update(...))` (and the
Fragment/Swarm equivalents) would call `.update()` on that
just-destroyed entity - it touches `this.visual` internally
(`setRotation`, `setPosition`, `g.clear()`), which throws once the
underlying GameObject is gone. An uncaught exception inside `update()`
stops Phaser's `requestAnimationFrame` loop entirely - the "freeze" the
user actually saw, not a crash dialog.

**Only reported via a shard hit, but not actually shard-specific**:
Fragment kills (shooting one down) and scrap pickups (touching a Swarm
piece) were exactly as broken, just not yet the specific thing the user
happened to trigger and notice.

Fix: moved the `fractureFragments`/`fractureSwarm`/`fractureShards`
filter calls to the early filter block, right alongside the six
existing arrays, before any entity `.update()` runs this frame -
exactly the fix already on record for the original version of this bug.
`fractureLasers` was never at risk the same way (it self-destroys
*inside* its own `update()`, not from an earlier `process*` call) and
keeps its existing later-block filter unchanged. The later block still
also re-filters `fractureFragments`/`fractureSwarm`/`fractureShards` -
not redundant: `updateScrapCountdown` (Swarm, on countdown expiry) and
each entity's own lifetime-expiry self-destroy (Fragment/Shard) both
still happen after the early filter, same reason the original six
arrays are also filtered twice already.

### Verified

- `npx tsc --noEmit`, `npx eslint .` - clean.
- `npx vitest run` - 95/95 passing, unchanged (a call-ordering fix, not
  a logic change - nothing here was extractable pure logic to test).
- `npm run build` - clean production build (62 modules).
- Transpile smoke check against the user's own already-running dev
  server (port 5173): curled the changed file - `200`.

### Not done yet

No in-browser playtest confirming the actual crash is gone (no browser
tool in this environment) - the fix is a direct, mechanical application
of a pattern this codebase has already proven fixes this exact failure
mode once before, not a guess. Not deployed - `debris/game` only.

---

## 2026-08-25 — The Fracture, pass 3: real attacks, ship contact, Swarm as scrap

### What was built

Direct follow-up request against pass 2's split-but-otherwise-inert
Fracture: real attacks for the Core and every Fragment role, ship
contact ("behave like rocks"), forced Black Hole removal on spawn, and
a full redesign of Swarm from a shootable hazard into a scrap pickup.
Given the number of load-bearing forks, three were resolved via
`AskUserQuestion` before writing any code: whether Swarm contact is
lethal (always safe, pure pickup), whether the stage-clear gate needs
every scrap piece collected (no - the user's own custom answer replaced
both offered options with a 10-second on-screen countdown instead), and
who the launcher Fragment aims at (a random living ship, not nearest).

- **Core (Phase 1) rework**: now spawns off-screen above top-center
  (`FRACTURE_SPAWN_OFFSCREEN_Y`) and drifts down
  (`FRACTURE.driftSpeedPxPerStep`) until it reaches arena-center, then
  stops (`Fracture.update()` now takes `arenaHeight`, detects arrival,
  zeroes velocity) - matches the original "floating in the center of
  the arena" pitch, just arrived at over a few seconds instead of
  instantly. Once stopped, fires a long laser in a random direction
  every 2s, one at a time (`Fracture.canFireLaser`/`recordLaserFired`,
  same readiness-check shape `Ufo.canFire`/`recordFired` already uses).
- **`entities/FractureLaser.ts`** (new): a long thin hazard, unlike
  every other circular thing in this game. Not Matter-backed - a
  rotated-rectangle body would've been a first for this codebase and
  untestable without a live browser, so hit-testing is a plain
  point-to-segment distance check instead (`systems/BeamGeometry.ts`,
  tested), same "pure math hazard" style the Black Hole already
  established. Telegraph (dim line) → active (thick lethal line) →
  fade, self-destroying once its own timeline finishes, same shape as
  `DestructionBurst`.
- **Fragment (Phase 2) roles are real attacks now**, not cosmetic
  flourishes:
  - 🔴 **Aggressive** - a pulsing ring out to 3x its own radius every
    5s, lethal only while expanding. Pure radius-over-time math lives
    in `systems/FractureRing.ts` (tested) so the timing/growth curve
    doesn't need a live entity to verify.
  - 🔵 **Gravity** - "acts like a small black hole," decided: reuses
    `systems/BlackHoleGravity.ts`'s `computeGravityForce` directly
    (`GameScene.applyFractureGravityForces`, new, mirrors
    `applyBlackHoleGravityForces` almost exactly) against the same
    entity scope the real Gravity Well pulls (ships/asteroids/UFOs/
    Shields/adrift Commanders), out to 3x the Fragment's own radius.
  - 🟡 **Launcher** - fires a gold shard
    (`entities/FractureShard.ts`, new - a jagged gold `Graphics`
    projectile, same constant-velocity/sensor/wrap shape as `UfoShot`)
    at a random living ship every 3s
    (`FractureFragment.canFireShard`/`recordShardFired`).
  Removed the old cosmetic-only gravity-particle-and-decorative-fling
  code path in favor of the real thing where it now overlaps (the
  particle spiral stays as a visual, launcher's old fading-dot fling is
  gone, replaced by an actual `FractureShard`).
- **Ship contact, "behave like rocks," decided**: the Core and every
  Fragment's collision mask now includes `CATEGORY.SHIP` alongside
  `CATEGORY.PROJECTILE`. Resolved in `handleCollision` exactly like an
  asteroid ram already is - straight into the existing `pendingShipHits`
  queue (Shield absorbs it, same as every other hazard), no new
  resolution logic needed. Neither side of the contact damages the
  Fracture itself, mirroring that an asteroid ram doesn't destroy the
  asteroid either. Scoped to ships only - asteroids still pass through
  every tier untouched, not requested this round.
- **Swarm (Phase 3) redesigned as a pickup, decided**: no longer
  shootable at all (its collision mask dropped `CATEGORY.PROJECTILE`,
  keeping only `CATEGORY.SHIP`, and it's now `isSensor: true`) - touching
  one is always safe and adds 1 to that player's new `scrap` field
  (`PlayerSlot.scrap`), shown in their HUD (`refreshAllPlayerHud`) right
  after their lives/status line, only once nonzero.
  `entities/FractureSwarmBit.ts` lost its `hitsRemaining`/`takeHit`
  machinery entirely - a pickup doesn't have "hits." Resolved via a new
  `pendingScrapPickups` queue, same shape as `pendingShieldPickups`.
- **10-second scrap-collection countdown**: once the last Fragment dies
  (`processPendingFractureFragmentHits` checks
  `fractureFragments.every(f => !f.isAlive)`), `beginScrapCountdown`
  starts a visible on-screen timer (`GameScene.scrapCountdownText`,
  the game's first numeric HUD countdown). When it runs out,
  `updateScrapCountdown` destroys whatever Swarm pieces are left
  uncollected - collection was always optional, never gating the
  stage-clear check itself.
- **"If Fracture appears, remove all existing black holes," decided**:
  `materializeFracture()` now force-despawns an active Black Hole the
  instant the Core appears, not just blocks new spawns (the previous
  pass's behavior) - `isFractureEncounterActive()` also gained the
  countdown window to its definition, so Black Hole spawning stays
  suppressed through scrap collection too.
- Two new pure-logic modules, both tested the same way every other rule
  in this codebase is: `systems/BeamGeometry.ts`
  (`distanceToSegment`/`isPointOnBeam`) and `systems/FractureRing.ts`
  (`ringPhaseAt`/`ringLethalRadiusAt`).

### Verified

- `npx tsc --noEmit`, `npx eslint .` - clean.
- `npx vitest run` - 95/95 passing (13 new: 6 in `beamGeometry.test.ts`,
  7 in `fractureRing.test.ts`).
- `npm run build` - clean production build (62 modules, up from 58).
- Transpile smoke check against the user's own already-running dev
  server (port 5173): curled every changed/new file directly - all
  `200`.

### Not done yet

Asteroid contact with any Fracture tier (still ships-only), and the
death/implosion sequence (`docs/roadmap.md`'s "The Fracture" section) -
a lethal hit at the Core/Fragment tiers still just destroys/splits it
outright, no implosion/pull-everything-in/explosion beat. Swarm's own
visual redesign ("make them look like broken parts of Fracture") is
explicitly waiting on the user's approval before being built - flagged,
not forgotten. No in-browser playtest of feel (does the laser's 2s
cooldown read as fair, does the gravity Fragment's pull feel meaningfully
different from the real Gravity Well, does a random-ship-targeted
launcher shard feel fair in 4-player Cooperative where it might always
pick the same unlucky player) - only static verification and a
transpile check. Not deployed - `debris/game` only.

---

## 2026-08-25 — The Fracture, pass 2: Core → Fragment → Swarm

### What was built

Direct follow-up request against the previous entry's entry-sequence-only
Fracture: specific HP tuning per tier, the actual splitting mechanic,
movement for the split-off pieces, and suppressing the Gravity Well
during the fight. All four landed together, since they're really one
change (the splitting logic needs the HP numbers to know when to split,
and the "no black hole" rule only makes sense once there's a multi-stage
fight worth protecting from interruption).

- **HP retuned**: `FRACTURE.maxHits` 30 → 20 (Core). New
  `fragmentMaxHits` (10, Phase 2) and `swarmMaxHits` (1, Phase 3, one-
  shot like every other enemy in the game).
- **Splitting, not just dying**: `GameScene.processPendingFractureCoreHits`
  no longer ends the encounter on the Core's death - it now calls
  `spawnFractureFragments()`, which creates one `FractureFragment` per
  role (🔴 aggressive, 🔵 gravity, 🟡 launcher - always all three, not
  three random picks) at the Core's death position, mirroring exactly
  how an asteroid spawns its two children on split. Each Fragment's own
  death (`processPendingFractureFragmentHits`) calls
  `spawnFractureSwarm()`, scattering `FRACTURE.swarmCountPerFragment`
  (6) `FractureSwarmBit`s outward - up to 18 total across the whole
  fight, reading as "dozens" per the original pitch without ever having
  that many alive from one single Fragment. Swarm bits
  (`processPendingFractureSwarmHits`) are the end of the line - no
  further split.
- **Two new entity classes**, both reusing `systems/AsteroidShape.ts`'s
  jagged-polygon generator and the exact `applyHit()`/materialize-
  invulnerability pattern the Core already established:
  - `entities/FractureFragment.ts` - a smaller Shard Cluster (three
    shards instead of six), core/tether tinted per role. The role only
    drives a cosmetic idle flourish so far, not a real attack: aggressive
    jitters its shards, gravity spirals small particles inward (visual
    homage to the Black Hole's own accretion disk, no actual pull force),
    launcher periodically flings a small decorative shard outward that
    fades over its flight.
  - `entities/FractureSwarmBit.ts` - no shared core at all, just one
    small jagged shard drifting and tumbling on its own.
- **Fragments and Swarm bits actually move** - "boss fracture do move in
  phase 2," decided directly, unlike the stationary Core. Plain
  constant-velocity drift set at spawn (`FRACTURE.fragmentSpeed` 0.4,
  `swarmSpeed` 0.9 - Swarm faster than Fragment, same "smaller is
  faster" convention `docs/gameplay.md` already uses for asteroid size
  tiers), with the same screen-wrap every other entity gets.
  Deliberately not player-seeking - "pure momentum, no steering," same
  philosophy asteroids already use.
- **Stage-clear gate extended a second time**: now
  `!this.isFractureEncounterActive()` (true while the Core, any
  Fragment, or any Swarm bit is still alive), not just `!this.fracture` -
  the fight isn't over until every tier is gone.
- **"During boss do not spawn black hole," decided**: the same
  `isFractureEncounterActive()` check now also gates the Gravity Well's
  spawn timer, right next to the existing UFO/Shield timers in
  `GameScene.update()`. An already-active Gravity Well at the exact
  moment the boss triggers is left to run out its own lifespan rather
  than force-despawned mid-flight - only *new* spawns are suppressed,
  a deliberate simplification worth flagging rather than silently
  deciding either way.
- Renamed `pendingFractureHits` → `pendingFractureCoreHits` for clarity
  now that there are three parallel pending-hit queues
  (`pendingFractureFragmentHits`, `pendingFractureSwarmHits` alongside
  it), all resolved the same way every other pending-hit queue in this
  file already is - queued in `handleCollision` (Matter is still
  mid-step there), resolved in `update()`.

### Verified

- `npx tsc --noEmit`, `npx eslint .` - clean.
- `npx vitest run` - 82/82 passing, unchanged (`applyHit()` itself didn't
  change - both new entity classes reuse the exact same tested function,
  just with different `hitsRemaining` starting values).
- `npm run build` - clean production build (58 modules, up from 56).
- Transpile smoke check against the user's own already-running dev
  server (port 5173): curled every changed/new file directly - all
  `200`.

### Not done yet

Same standing list as the previous entry, still accurate: no actual
attacks (the Phase 2 role flourishes are cosmetic, not gameplay effects
on ships), no ship/asteroid contact at any tier, no death/implosion
sequence. No in-browser playtest of feel (does the Fragment/Swarm split
read as escalating or just more of the same, do the HP numbers feel
right relative to each other, does suppressing the Gravity Well actually
matter or was it never colliding with the fight in practice) - only
static verification and a transpile check. Not deployed - `debris/game`
only.

---

## 2026-08-25 — The Fracture, first pass: trigger, announcement, materialize

### What was built

Debris's first boss. Went through the now-established design flow for
this project: an `AskUserQuestion` on the two load-bearing forks before
writing any code (does defeating it become required to clear the stage,
or are the 4 rocks alone sufficient; does it apply to all three modes or
just Cooperative/Competitive) - both came back "yes, all the way" -
then a live concept review for the intact Phase 1 silhouette (three
options: Cross Formation, Faceted Monolith, Shard Cluster), **Shard
Cluster** chosen, then that same concept extended live through Phase 2
(the three-fragment split) and Phase 3 (the swarm) for reference, before
any implementation started.

Explicitly scoped down to just the *entry sequence* on request - "let's
build it into the game" was specifically about trigger + announcement +
materialize, not the full Core → Fractured → Swarm boss described in
`docs/roadmap.md`'s "The Fracture" section. What actually landed:

- **Trigger**: the very first stage clear of a round (all three modes)
  diverts into the boss sequence instead of a normal next wave -
  `GameScene.beginNextLevel()`'s `fractureIntroduced` flag latches so
  this only ever happens once per round.
- **Announcement**: a 3-second "THE FRACTURE" banner in the boss's own
  danger-red, at 96px - bigger than every other overlay's 48px, and the
  game's first *non-interactive, timed* overlay (`GameScene.
  showFractureAnnouncement()` + `time.delayedCall`) - every other one
  (STAGE CLEARED, GAME OVER, PAUSED) waits for a keypress instead.
  Physics stays paused throughout, same as every other overlay state.
- **Materialize**: fades/scales in at **top-middle**
  (`FRACTURE_SPAWN_Y`), together with 4 large asteroids spawned via the
  existing `spawnWave()` - no new asteroid-spawn path needed. The
  fade/scale-in itself is `entities/Fracture.ts`'s own ease-out-cubic
  ramp over `FRACTURE.materializeDurationMs`, same curve `ScorePopup`
  already uses.
- **A basic destructible Phase 1**: Debris's first multi-hit enemy -
  every other enemy (asteroids, the UFO) dies in one shot.
  `systems/FractureCombat.ts`'s `applyHit()` (tested) is the whole rule;
  `FRACTURE.maxHits` (30) is a pure starting guess, same standing caveat
  as every other untested constant in `GameConfig.ts`. A new
  `CATEGORY.FRACTURE` collision category, and `Projectile`'s own mask
  extended to include it - the only category that can hit it at all
  right now (see "Not done yet").
  Invulnerable while still materializing (`Fracture.isMaterializing()`)
  - a shot lands and gets consumed, but doesn't count, same fairness
  spirit as `SHIP.respawnInvulnerabilityMs`.
- **Stage-clear condition extended**: `if (this.asteroids.length === 0
  && !this.fracture)` - the round doesn't advance until it's dead too,
  per the `AskUserQuestion` answer. On death (hitsRemaining reaches
  zero): destroyed outright (no split - that's Phase 2, not built),
  burst + shake + the game's single biggest score payout so far
  (`FRACTURE.score` = 1000) via the existing `awardScore()`/`ScorePopup`
  path, same as any other kill.

### Verified

- `npx tsc --noEmit`, `npx eslint .` - clean.
- `npx vitest run` - 82/82 passing (3 new in `fractureCombat.test.ts`).
- `npm run build` - clean production build (56 modules, up from 54).
- Transpile smoke check against the user's own already-running dev
  server (port 5173): curled every changed/new file
  (`Fracture.ts`, `FractureCombat.ts`, `GameScene.ts`, `GameConfig.ts`,
  `Projectile.ts`, `CollisionCategories.ts`) directly - all `200`.

### Not done yet

Everything past the entry sequence, on purpose - see
`docs/roadmap.md` item 19 for the full list: Phase 2 (splitting into the
aggressive/gravity/launcher trio), Phase 3 (the swarm), any actual
attacks (laser, crystal projectiles), the death/implosion sequence, and
ship/asteroid contact - it currently has **no** collision interaction
with anything except a player's own shot (its collision mask is
`CATEGORY.PROJECTILE` only), so ships and asteroids currently fly
straight through it. Also stale against the original pitch: "The
Fracture" future-ideas section said "anchored at the arena's center" -
this pass materializes at top-middle instead, per this session's more
specific instruction; `docs/roadmap.md` flags the discrepancy for
whoever picks up "slow movement" next. No in-browser playtest of feel
(is 3 seconds the right announcement length, does top-middle read well,
does 30 hits feel appropriately huge) - only static verification and a
transpile check. Not deployed - `debris/game` only.

---

## 2026-08-25 — Score popup on hit

### What was built

Requested directly: "when a shot hits a target, a little number popup
should appear with the value that is added to the players score... in
the color of the player." Went through the established "show me before
building" flow, `AskUserQuestion` not needed here since the request was
already unambiguous.

- Reviewed 3 live-rendered motion concepts (Classic Rise, Punchy Pop,
  Drift &amp; Glow), each firing on a loop cycling all 4 player colors and
  the game's real score values (+20/+50/+100/+200), in the game's own
  monospace font. User picked **Drift &amp; Glow** (C) - sideways drift,
  gentle rotation, outlined text, soft glow, floatier than the plain
  option.
- Follow-up request: "C, but smaller. size of the smallest rocks." -
  re-reviewed at true 1:1 pixel scale (no CSS/canvas stretching) next to
  a real small-rock silhouette drawn at its exact radius
  (`ASTEROID.small.radius`, 8px), side by side with the original size,
  so the size claim was an actual pixel measurement rather than a
  description. Confirmed, then built at that scale.
- **`entities/ScorePopup.ts`** (new): a single `Phaser.GameObjects.Text`,
  not the `Graphics`-particle pattern `DestructionBurst` uses - that
  pattern is about avoiding Phaser's `ParticleEmitter` for *many*
  decorative dots, not a rule against `Text`, which the HUD already uses
  throughout. Same hand-managed `update()`/`isAlive`/`destroy()` shape as
  every other transient effect in this game (`GameScene` drives it every
  frame, no Phaser tween). Rise/drift/rotation/fade are plain eased math
  against elapsed time; the glow is `Text.setShadow(...)`, a blurred
  shadow standing in for the reviewed concept's canvas radial gradient -
  close enough at this size to not be worth a second `Graphics` object
  per popup.
- **`GameConfig.ts`**: new `SCORE_POPUP` block - `fontSizePx: 11`
  (matches the reviewed rock-sized concept, was 26px in the first
  review), plus proportionally-scaled `glowBlurPx`, `strokeWidthPx`,
  `driftRange`, `riseDistancePx`, `rotationRad`, `lifespanMs: 650`.
- **`GameScene.ts`**: `awardScore(ownerIndex, amount)` gained a required
  `position: Vector2` parameter (the hit location) and now spawns a
  `ScorePopup` there in `COLORS.players[ownerIndex]` - both existing call
  sites (`destroyAsteroid`, the UFO-kill branch of
  `processPendingUfoHits`) already had the position in scope, just
  weren't passing it through. New `scorePopups` array, reset in
  `create()`, updated/filtered every frame alongside the existing
  `bursts` array.
- Also fixed a doc staleness this entry surfaced: `docs/art_direction.md`'s
  Black Hole section still described the gravity-field glow as drawn at
  `gravityRadius` - stale since the earlier same-day whole-screen-gravity
  change split that into a separate visual-only `glowRadius`. Corrected
  while in the file.

### Verified

- `npx tsc --noEmit`, `npx eslint .` - clean.
- `npx vitest run` - 79/79 passing, unchanged (no new pure logic to
  test - `ScorePopup` is presentation-only, driven by `GameConfig`
  constants already covered by the concept review, not novel game
  rules).
- `npm run build` - clean production build (54 modules, up from 53).
- Transpile smoke check against the user's own already-running dev
  server (port 5173): curled `ScorePopup.ts` and the changed
  `GameScene.ts` directly, both `200`.

### Not done yet

No in-browser playtest of the popup's timing/legibility during actual
play (does 650ms read as too fast/slow mid-fight, does the glow read at
11px against a busy field) - only static verification and a transpile
check. Not deployed - `debris/game` only, ships with the next
`rheinarts:<tag>` portal build/push/deploy.

---

## 2026-08-25 — Gravity Well: whole-screen reach + real spawn/pause cadence

### What was built

Follow-up tuning request on the same-day Gravity Well feature (previous
entry), directly specified: "the black hole should affect the whole
screen, the farther away the lesser the effect," and a concrete
spawn/pause cadence - "spawn for 30 seconds, then disappear, then pause
60 seconds before spawning again."

- **`GameConfig.ts`**: `BLACK_HOLE.gravityRadius` 260 → 2300px, past the
  1920x1200 arena's own diagonal (~2265px), so the linear falloff in
  `computeGravityForce` never hard-cuts to zero anywhere in the playable
  field - every point on screen now feels *some* pull, fading out
  gradually rather than sharply within a small local radius.
  `pullForceMax` is untouched (still weak enough to out-thrust right at
  the event horizon) - only the *reach* changed, not the near-field
  strength.
- **Split the visual glow from the physics radius.** `entities/BlackHole.ts`
  drew its outer glow rings straight from `gravityRadius` - fine at
  260px, but a literal 2300px halo would just tint the whole screen
  instead of reading as a hazard. Added a separate `BLACK_HOLE.glowRadius`
  (260, the old value) for the visual only; the gameplay force still
  reaches the whole arena, the drawn glow stays a compact ring near the
  hole itself.
- **Fixed a real bug in the spawn timer** while wiring up the new 30s/60s
  cadence: the previous entry's `lastBlackHoleSpawnAtMs` was set once at
  scene start and never reset, so once past the first spawn delay the
  "only respawn after `spawnIntervalMs`" check was permanently
  satisfied - a black hole would despawn and then respawn essentially
  instantly, with no real pause at all. Renamed/split into
  `blackHoleDespawnedAtMs` (reset in `despawnBlackHole()`, which now
  takes `nowMs`) and `blackHoleSpawnedAtMs`, checked against two
  distinct config values - `BLACK_HOLE.activeDurationMs` (30000, was
  `lifespanMs` at 14000) and `BLACK_HOLE.pauseDurationMs` (60000, was the
  buggy `spawnIntervalMs`).

No changes to `systems/BlackHoleGravity.ts` itself - the pure
force/capture/lethal functions didn't need new logic, only different
config values fed into the existing linear falloff, plus the `GameScene`
timer fix above.

### Verified

- `npx tsc --noEmit`, `npx eslint .` - clean.
- `npx vitest run` - 79/79 passing, unchanged (the pure gravity math
  didn't change, only config values and `GameScene`'s own timer state).
- `npm run build` - clean production build.
- Dev server already running on the user's own port (5173) picks this up
  live via HMR - not separately smoke-checked this entry.

### Not done yet

No in-browser playtest of the new whole-screen falloff or the 30s/60s
cadence - static verification only. Not deployed - `debris/game` only,
ships with the next `rheinarts:<tag>` portal build/push/deploy.

---

## 2026-08-25 — Gravity Well (mode-agnostic black hole hazard)

### What was built

Next roadmap item after the leaderboard work: "Black hole that can
appear." Scoped through `AskUserQuestion` into a periodic, fixed-in-place
hazard that pulls *everything* toward it (ships, asteroids, the UFO,
shields, adrift commanders alike — no mode carve-outs), lethal only in a
tiny core, but with the event horizon itself as a genuine point of no
return: cross it and you're captured, no escaping back out under your
own thrust.

**Physics** (`systems/BlackHoleGravity.ts`, pure and unit-tested): three
concentric zones per `BLACK_HOLE` config in `GameConfig.ts` -
`gravityRadius` (a distance-falloff pull, escapable), `eventHorizonRadius`
(inescapable - velocity gets overridden, not just nudged, and pulls
harder the closer to center), `lethalRadius` (destroyed on contact).
Getting the two-pass Matter.js ordering right in `GameScene.ts` took
noticing that `Ship.update()` unconditionally re-clamps/re-sets velocity
from thrust input *every frame*, regardless of what else touched it that
frame:

- Gravity (escapable zone) is applied via `applyForce`, and that call has
  to happen *before* `ship.update()` runs, so it blends with thrust
  instead of being immediately overwritten by it.
- Capture (event-horizon zone) is applied via `setVelocity`, and that
  call has to happen *after* `ship.update()` runs, so it has final say
  and can't be clobbered by the ship's own per-frame clamp.

Lethal hits for ships/UFO reuse the existing `pendingShipHits` /
`pendingUfoHits` queues (the UFO push sets `awardScore: false`, since
falling into a hazard isn't a player kill) rather than a parallel
destruction path, so a black hole elimination goes through the exact
same explosion/respawn/scoring machinery as every other death - one
source of truth for "how does something die," not a second one bolted on
for this hazard specifically.

**Judgment call**: a Shield absorbs the lethal-center hit instead of
dying to it (consistent with Shield already being the answer to "how do
I survive things that would otherwise kill me" everywhere else in
Debris), and on absorption the ship gets teleported back out past the
event horizon and given brief invulnerability (`shieldEjectSpeed`,
`shieldEjectInvulnerabilityMs`) - straight `setVelocity`-only recovery
would immediately get re-captured by the same field it just escaped,
since it's still inside the event horizon the instant the shield pops.

**Visual** (`entities/BlackHole.ts`, no Matter body - GameScene runs pure
distance checks against it every frame, same non-physics-entity pattern
as `SpaceStation`): reviewed 4 live-rendered concepts (Accretion Disk,
Warning Rings, Spiral Vortex, and a 4th - Lensed Disk - added mid-review
after the user linked a NASA black-hole visualization page as reference,
`https://svs.gsfc.nasa.gov/13326`, which I fetched directly). Concept A,
Accretion Disk, was chosen: layered concentric circles standing in for a
radial gradient (Phaser Graphics has no true radial fill) for the
gravity field, a tilted slowly-rotating elliptical disk ring with inward-
spiraling particles, a solid black void at the lethal radius, and a
pulsing rim at exactly the event-horizon radius. The three drawn radii
are the *literal* `BLACK_HOLE` config values, not independently-tuned
"looks right" numbers - for fairness, what the player sees has to be
exactly where the gameplay boundaries actually are.

### Verified

- `npx tsc --noEmit`, `npx eslint .` - clean.
- `npx vitest run` - 79/79 passing (11 new in `blackHoleGravity.test.ts`
  covering `computeGravityForce`/`isCaptured`/`isLethal`/
  `computeCaptureVelocity`).
- `npm run build` - clean production build.
- Dev-server smoke check: `npx vite` on a fresh port, curled `/`,
  `/src/main.ts`, and the three new source files
  (`entities/BlackHole.ts`, `scenes/GameScene.ts`,
  `systems/BlackHoleGravity.ts`) directly to confirm Vite transpiles them
  without error - all `200`.

### Not done yet

No in-browser playtest of the hazard itself this entry (spawn timing,
capture feel, the shield-eject escape) - only static verification
(types/lint/tests/build) and a transpile-level smoke check. Not deployed
either, since this is `debris/game` only - it ships with the next
`rheinarts:<tag>` portal build/push/deploy, same as every other
frontend-only change this session.

---

## 2026-08-26 — Fixed the /api/debris/ nginx proxy for real (three more bugs, found live)

### What was built

The previous entry's `nginx.conf` proxy looked right, passed a local
Docker test, and still didn't work once actually deployed - reported by
the user as "no scores yet" on the real site (`https://rheinarts.de`),
diagnosed down through: browser DevTools Network tab (502) → `kubectl -n
rheinarts get pods` (`debris-highscore-api` was `ImagePullBackOff` - the
API image had never actually been built/pushed, since that was always
the user's step to run, not mine) → after the user built and pushed it,
a *different* symptom (404, then 500) that turned out to be nginx
config bugs in the fix from the previous entry, invisible until there
was a real backend on the other end of the proxy to observe them
against.

Root cause: the previous entry's local verification only ever tested
"does nginx start, and does it fail gracefully with *no* backend
running" - it never had a live API to actually proxy to, so three more
bugs in the same `location /api/debris/` block went uncaught:

1. **The prefix wasn't actually being stripped.** nginx's usual
   "trailing slash on `proxy_pass` strips the matched location prefix"
   trick only applies when the target is a *literal* string - with a
   variable target (required for the previous entry's startup-crash
   fix), nginx forwards the original, unstripped request URI instead.
   The upstream was receiving `/api/debris/highscores` verbatim and
   404ing (it only has a `/highscores` route). Fixed with an explicit
   `rewrite ^/api/debris/(.*)$ /$1 break;`.
2. **A variable-target `proxy_pass` with no explicit path** -
   `proxy_pass http://$var;` - doesn't fall back to nginx's usual
   implicit "no URI = pass the original request through" behavor either;
   every request 500'd with `invalid URL prefix in "http://"`. Fixed by
   spelling out `$uri` explicitly: `proxy_pass http://$var$uri;`.
3. **`set` has to come *before* `rewrite ... break`, not after.**
   `break` halts every remaining directive from
   `ngx_http_rewrite_module` in the current block - `set` is
   implemented by that same module, so a `set` placed after `break`
   silently never runs at all. Every request 500'd again, this time with
   `using uninitialized "highscore_upstream" variable` / `no host in
   upstream` in the error log. Fixed by reordering: `set` first, then
   `rewrite ... break`.

**Actually verified this time** by reproducing the real two-service
topology locally, not a single standalone container: a Docker network
with the API container aliased to the exact k8s DNS name
(`debris-highscore-api.rheinarts.svc.cluster.local`) the production
`nginx.conf` hardcodes, and the portal image on the same network - the
first local test that could have caught any of these three bugs, and
did (each fix was verified against a live `GET`/`POST` round trip and an
`nginx` error-log check showing zero warnings/errors, not just an HTTP
status code) before handing anything back.

### Verified

- Full round trip against the real two-container topology: `GET
  /api/debris/highscores` → `200 []`, `POST` a valid entry → `200
  {"accepted":true,...}`, `GET` again → the entry persisted, `nginx`
  error log clean (no warnings, no errors) throughout.
- Portal/HyperOut/Godspeed/Debris all still `200` on the same running
  container - confirms this location block's fixes didn't disturb
  anything else.
- No code changes on the `debris/game` or `debris/highscore-api` side
  this entry - `nginx.conf` and the root `Dockerfile` (the
  `docker/resolve-coredns.sh` wiring) only.

### Not done yet

Not yet redeployed - this fix lives in the *portal* image (`nginx.conf`
is baked into the root `Dockerfile`, not `debris-highscore-api`'s own),
so it needs a new `rheinarts:<tag>` build/push/deploy (the
`debris-highscore-api` image itself doesn't need rebuilding - it was
never the problem). Same standing rule as everything else: written and
locally verified, not pushed or applied by me.

---

## 2026-08-26 — Global top-10 high score leaderboard (Rhein Arts' first backend service)

### What was built

Requested as "make the Single Player best score permanent even if the
server reboots" - clarified through several rounds of `AskUserQuestion`
into something bigger than a storage-location swap: a **global,
server-side, top-10 leaderboard** shared by every player on the site,
with classic-arcade **3-letter initials entry** on a qualifying run.
Went through `EnterPlanMode` first given the scope (the whole portal was
static files behind nginx before this - no backend, no database,
anywhere in Rhein Arts).

**New `debris/highscore-api`** - a standalone TypeScript/Node package,
sibling to `debris/game`, matching its tooling conventions
(`tsconfig.json` strictness, `eslint.config.js`, `vitest`) for a Node
runtime instead of a Vite build. Deliberately no framework - three
routes doesn't justify one, and the runtime has *zero* third-party
dependencies (only `node:http`/`node:fs/promises`/`node:path`), so the
shipped Docker image doesn't even need `node_modules`, just the
compiled `dist/`. `src/leaderboard.ts` is pure logic (`qualifies`,
`insertEntry`, `isValidInitials`, `isValidScore`, `normalizeInitials`),
tested, same "pure rule logic gets extracted and unit-tested" convention
as `systems/CombatSystem.ts`'s `canFire` or Debris's own
`systems/CommanderRescue.ts`. `src/storage.ts` persists to one JSON file
via write-to-temp-then-`rename` (atomic on POSIX, so a crash mid-write
can't corrupt it). `src/server.ts` is three routes (`/healthz`,
`GET`/`POST /highscores`) on a plain `node:http` server - honest doc
comment on what this *doesn't* do: no gameplay verification, a `POST` is
trusted input like most simple arcade leaderboards without full
server-authoritative gameplay, validation here is spam/garbage
prevention, not anti-cheat.

**Deployment**: its own single-replica `Deployment` + `ClusterIP`
`Service` + `PersistentVolumeClaim` in `k8s/rheinarts.yaml`, deliberately
*not* a sidecar in the `rheinarts` pod - that Deployment runs
`replicas: 2`, and the cluster's default StorageClass is
`ReadWriteOnce` (one node, one writer); two pods sharing write access to
one file would be a real problem. Only this one pod ever mounts the
volume - both `rheinarts` web replicas reach it over the cluster network
via a new nginx `/api/debris/` proxy instead. Own `Dockerfile`, own
image (`ghcr.io/g33kde/debris-highscore-api:<tag>`), own
build/push/deploy steps documented in `DEPLOYMENT.md` as a parallel
section to the portal image's - built and run locally (`docker build` +
`docker run` + `curl`, including a kill-and-restart to confirm the PVC
mount pattern actually persists data), never pushed or applied to the
cluster, same standing rule as every other deploy this session.

**Two real bugs, both caught by actually running the built artifacts,
not by reading the config**:

- `nginx.conf`'s first version proxied to a literal hostname
  (`debris-highscore-api.rheinarts.svc.cluster.local`). A local
  `docker run` of the built portal image immediately showed nginx
  refusing to start at all - `host not found in resolver` - because a
  literal `proxy_pass` hostname is resolved once at *config-load* time,
  and if it's not resolvable yet (pod startup ordering, or the API
  Deployment briefly down), nginx won't start. That would have taken
  down the *entire portal* - HyperOut and Godspeed included - over one
  game's leaderboard. Fixed with the standard pattern: a `resolver`
  directive + a `proxy_pass` target given as a variable, which defers
  DNS resolution to *request* time - nginx starts regardless, and only
  an actual `/api/debris/` request fails (502) if the upstream truly
  isn't reachable. The `resolver` directive itself needs a real IP, not
  a hostname (same chicken-and-egg problem one level up), so a new
  `docker/resolve-coredns.sh` runs via nginx:alpine's own
  `/docker-entrypoint.d/` hook, substituting the nameserver IP
  Kubernetes already writes into every pod's `/etc/resolv.conf` before
  nginx ever starts. Re-verified after the fix: same `docker run`, nginx
  starts clean, portal/HyperOut/Godspeed/Debris all still `200`, and
  `/api/debris/highscores` degrades to a graceful `502` (no real
  upstream in a standalone container test) instead of taking anything
  else down.
- `vite.config.ts`'s dev proxy (`server.proxy`) forwards the *full*
  original path by default - unlike nginx's `proxy_pass`, which strips
  the matched location prefix automatically when its target URL ends in
  `/`. A local end-to-end test (the game's dev server + the API's dev
  server, both running, `curl` through the proxy) immediately showed
  `{"error":"not found"}` - the request was landing at the API as
  `/api/debris/highscores`, not `/highscores`. Fixed with an explicit
  `rewrite` function stripping the prefix, giving local dev the same
  behavior as production instead of a silent mismatch nobody would have
  noticed without actually running both servers together.

**Frontend**: new `systems/HighScoreApi.ts` (`fetchLeaderboard`,
`submitHighScore`, both degrading gracefully to an empty/failed result
on any network error - same spirit as `AudioSettings.ts`'s `localStorage`
try/catch - plus `qualifiesForLeaderboard`, a small deliberate
duplication of the server's own `qualifies()` check, tested, since
there's no shared package between the two and the server remains the
sole authority on what actually gets persisted either way).
`systems/HighScore.ts` (the old `localStorage` personal best) and its
test are gone, fully superseded.

`MenuScene.ts`'s single "BEST SCORE: ####" line replaced with a
two-column top-10 list (ranks 1-5 left, 6-10 right - a single vertical
list doesn't fit the ~135px gap between the mode toggle and the player
cards at a readable size), fetched on every Single Player (re)selection.
`GameScene.ts`'s `checkRoundOutcome()` Single Player branch is now async -
fetches the leaderboard, checks qualification, and either starts a new
3-letter initials-entry flow (`enterInitialsEntry`/`updateInitialsEntry`/
`confirmInitialsEntry`, a new `'enteringInitials'` `SessionState`) or
goes straight to the normal GAME OVER overlay. Initials entry reuses
whatever input the player was already flying with
(`this.players[0].input`, still live post-death) - `turnDirection`
(edge-triggered) cycles the active letter A-Z, `isFiring`
(edge-triggered) confirms and advances - rather than inventing new
control-scheme-aware UI code.

### Verified

- `debris/highscore-api`: `npx tsc --noEmit`, `npx eslint .` both clean;
  `npx vitest run` 12/12 (leaderboard.ts's full pure-function surface);
  `npm run build` clean; ran the built server directly and exercised
  every route with `curl` (empty-state `GET`, a qualifying `POST`,
  malformed-input `400`s, a `404`, and a kill+restart to confirm
  persistence).
- `debris/game`: `npx tsc --noEmit`, `npx eslint .` both clean;
  `npx vitest run` 68/68 (down net from 74 after removing
  `highScore.test.ts`'s 6, up from adding `highScoreApi.test.ts`'s
  fetch/fallback coverage); `npm run build` clean.
- End-to-end locally: the game's dev server + the API's dev server
  running together, exercised the full proxy chain with `curl`
  (`GET`/`POST` through `/api/debris/highscores`, confirmed the prefix-
  stripping fix).
- Docker: built and ran both images - the API standalone (with a real
  mounted volume, confirmed restart-persistence) and the full portal
  image (confirmed the nginx startup-crash fix and that every other
  route stays unaffected).

### Not done yet

Not seen running in an actual browser - the initials-entry UI's letter-
cycling feel (does edge-triggered turnDirection feel responsive or
laggy), the two-column leaderboard's fit/readability on the actual menu
screen, and the "does this hold up over gamepad input specifically" case
are all reasoned from code, not observed. Not deployed - the API image
has never been pushed to GHCR or applied to the cluster; that's the
user's call, same as every other deploy this session.

---

## 2026-08-25 — Cooperative repositioned as the main mode (docs + portal copy)

### What was built

Docs-only. Requested: "Cooperative should be the main game driver" -
scoped via `AskUserQuestion` to two specific places (the portal cabinet
card and `docs/vision.md`'s pitch/pillars), explicitly leaving
`docs/gameplay.md`'s "none is the 'real' mode" mode-intro line alone -
that's a rules-equality statement, not a promotion/framing one, and the
user didn't ask for it.

`web/index.html`'s Debris card description changed from the mode-agnostic
"Drift through a field of shattering rock. Grab the shield. Watch the
skies." to "Eject. Get rescued. Keep flying." - matches the portal's
established three-beat card-copy rhythm (HyperOut's "Two light cycles.
One grid. Don't get boxed in.", Godspeed's "Descend a procedural
labyrinth. Guardians hunt. Every floor gets worse."), and makes the
Emergency Ejection & Rescue mechanic (previous entry) the entire hook
rather than restating "it's an Asteroids clone" (already covered by the
card's own `1–4 PLAYERS • ASTEROIDS CLONE` meta line).

`docs/vision.md`'s elevator pitch rewritten to lead with rescue/crew
survival rather than "alone or with friends" neutrality. Its "Two ways
to play" pillar - already stale (there are three modes now, not two;
Single Player landed after that line was last touched) - replaced with
"Cooperative is the main driver," explicitly naming Competitive and
Single Player as fully-built and not afterthoughts, but no longer
co-equal with Cooperative the way the original pillar framed them.

### Verified

Docs only - no code changed, nothing to run.

---

## 2026-08-25 — Emergency Ejection & Rescue (Cooperative-only)

### What was built

Not previously scoped - requested directly, and it implements/resolves
the "Co-op rescue mechanics" Future Idea already on the roadmap (several
of its open questions decided differently than originally speculated -
see that entry's updated note). Scoped via `AskUserQuestion` on four
core-mechanic questions before writing any code (relationship to the
existing lives system, whether the rescue timer covers delivery or just
pickup, whether the drifting pilot can be killed by hazards, whether the
station is a physical obstacle), then visuals via a live-rendered
concept-comparison artifact (three Commander concepts, three Space
Station concepts, canvas-rendered at the game's actual palette/stroke
style) - the same "decided from live-rendered concepts" process every
other entity in this game went through. Commander picked concept B
("Astronaut"), refined on request to add arms and legs, each limb
swaying on its own independent phase; Space Station picked concept B
("Cross Dock").

**Replaces the lives/respawn system entirely, in Cooperative only.**
Competitive and Single Player are untouched - they keep the exact
lives/respawn/invulnerability system from earlier entries. In
Cooperative, an unshielded hit no longer costs a life or auto-respawns:
`GameScene.ejectCommander()` spawns a new `Commander` (the ejected pilot)
at the ship's position instead. `PlayerSlot` gained `eliminated` (the
new uniform "is this player out for the round" flag - `aliveFlagsBySlot()`
now reads `!eliminated` across every mode, only *how* it gets set
differs) and `towedCommander` (which Commander, if any, this player is
currently flying to the station).

**`entities/Commander.ts`** - a Matter sensor body (like `Shield`), two
states:

- **adrift**: drifts on its own velocity, wraps at arena edges, shows a
  countdown to `COMMANDER.rescueWindowMs` (10s) directly beneath it, and
  is vulnerable to hazards (decided: a real risk, not just a countdown) -
  an asteroid, UFO ram, or UFO shot destroys it via new
  `pendingCommanderHazardHits` handling, permanently eliminating that
  player (`processPendingCommanderHazardHits`,
  `processCommanderExpiry` for the timeout case).
- **carried**: towed behind a rescuing ship
  (`systems/CommanderRescue.ts`'s `computeTowPosition` - trails behind
  the carrier's heading, not glued on top of it), countdown hidden
  (decided: pickup alone saves the life, so there's nothing left to race
  after that).

Pickup is automatic on touch (`handleCollision`'s new Commander branches
→ `pendingCommanderPickups` → `processPendingCommanderPickups`), gated so
a ship already towing one can't pick up a second. **`entities/
SpaceStation.ts`** - fixed at arena center for the whole round, not
Matter-backed at all (decided: trigger zone only) - `GameScene.
processStationDropOffs` checks a carrying ship's plain distance against
it each frame (`isWithinDropOffRange`) and, once close enough, respawns
the *rescued* player (not the rescuer) there via `respawnRescuedPlayer`,
with the same brief invulnerability window every other respawn already
grants.

**Edge case, not explicitly specified - resolved as a judgment call**:
if a rescuer is destroyed while towing, the Commander drops back into
open space (`Commander.drop()`) rather than being lost with them -
already-rescued (`hasBeenRescuedOnce` stays true), so no new countdown
starts and it can't be eliminated by expiry again, but it is vulnerable
to hazards again while waiting for a second pickup. Documented in
`docs/gameplay.md` and the roadmap's updated Future Idea note.

New pure logic in `systems/CommanderRescue.ts` - `hasRescueWindowExpired`
(same shape as `CombatSystem.ts`'s `canFire`), `computeTowPosition`, and
`isWithinDropOffRange` - tested without touching Matter or a live
Commander.

**Corner HUD extended** (the "more player info might be added in the
future" the last HUD entry called out already materializing): a new
Cooperative-only third line per corner (`cooperativeStatusLine`) - blank
while flying normally, `EJECTED`/`INBOUND` while a Commander's in play,
`ELIMINATED` once that fails. Competitive/Single Player keep the lives
dots exactly as before.

Collision categories gained `COMMANDER` (`CollisionCategories.ts`);
`Ufo`'s and `UfoShot`'s masks explicitly widened to include it (their
masks are hand-listed, not the broad `0xffff`-style masks Ship/Asteroid
already use, so this needed an explicit change on both).

### Verified

- `npx tsc --noEmit`, `npx eslint .` both clean.
- `npx vitest run`: 66/66 passing (up from 58) - new
  `tests/commanderRescue.test.ts` covers all three pure functions
  (window-expiry boundary, tow-position geometry at two headings,
  drop-off range at/inside/outside the radius).
- `npm run build` clean (51 modules).
- Dev-server smoke check: `npx vite --port 5177` (a fresh port, not the
  user's own long-running dev server), curled `/` (200) and
  `/src/main.ts` (200).

### Not done yet

Not seen running in an actual browser - the countdown's legibility next
to the small Commander sprite, the tow offset actually reading as
"behind" the carrier rather than overlapping it, the Space Station's
drop-off radius feeling forgiving rather than fussy, and the corner
HUD's new third line fitting cleanly are all reasoned from code and the
concept-review artifact, not observed. The dropped-mid-transit edge case
in particular has no test coverage of its own (Matter/Phaser-integration
shaped, not pure logic) and wasn't explicitly requested - flagged in
docs as a judgment call for the same reason.

---

## 2026-08-24 — Per-player corner HUD

### What was built

Requested: move each player's stats into their own screen corner, in
their own color, built to accommodate more per-player info later. This
replaces the old single shared readout (`scoreText`/`livesText`, top-left,
white text, all players pooled into one or two lines) with one `Text`
object per active `PlayerSlot` (new `hudText` field), positioned per
`PLAYER_HUD_CORNERS`: P1 top-left, P2 top-right, P3 bottom-left, P4
bottom-right - the same quadrant layout as the existing ship spawn
diamond (`PLAYER_SPAWN_OFFSETS`), so a player's corner and their spawn
point land in the same part of the screen. Only active slots get a
corner - inactive ones (e.g. P3/P4 in a 2-player Cooperative round, or
P2-P4 in Single Player) show nothing, not an empty placeholder.

Each corner is colored via `toCssHex(COLORS.players[slotIndex])` and
shows a small stack of lines (`P1` / `SCORE 120` / `●●●`), built via a
new `refreshAllPlayerHud()` that replaces the old `refreshScoreText()`/
`refreshLivesText()` pair. **Built to grow**, per the request: adding a
new per-player stat later is a one-line addition to the `lines` array in
`refreshAllPlayerHud()`, not a layout rework - each corner's `Text`
origin anchors from its own true corner (top corners grow downward,
bottom corners grow upward), so more lines never drift text off-screen
or across the arena's midline. Score keeps the exact per-mode framing
`docs/gameplay.md` already decided: Cooperative/Single Player show the
same pooled total in every corner, Competitive shows each player's own
tracked score.

The old top-right mode indicator (`COOPERATIVE`/`COMPETITIVE`/`SINGLE
PLAYER`) moved to top-center, since P2's new corner now occupies its old
spot.

Documented as a new "In-round HUD, decided" section in
`docs/art_direction.md` - this layout wasn't written down anywhere
before, it had just evolved directly in code.

### Verified

- `npx tsc --noEmit`, `npx eslint .` both clean.
- `npx vitest run`: 58/58 passing, unchanged - this is Phaser Text/layout
  work, not pure rule logic to extract.
- `npm run build` clean (47 modules).
- Dev-server smoke check: `npx vite --port 5176` (a different port than
  the user's own long-running dev server, to avoid disturbing it), curled
  `/` (200) and `/src/main.ts` (200).

### Not done yet

Not seen running in an actual browser - the corner margins, font size,
and multi-line stacking (does a 3-line block actually clear the arena
edges at `HUD_MARGIN`'s 12px) are reasoned from the same values the old
single readout already used, not observed. Bottom-corner readability
against the play field's background art (`PlayfieldBackground`) hasn't
been checked either - the old HUD only ever lived in the two top
corners.

---

## 2026-08-24 — Fixed gamepad assignment picking up a phantom "gamepad"

### What was built

Root-caused via a live debug session with the reporting user (temporary
logging added to `buildPlayers()`, removed once the cause was confirmed -
no gamepad hardware exists in this environment, so this couldn't be
reproduced any other way): "gamepad only works for P3," "P1 gets no
control in Single Player," and the earlier "gamepad recognized for P1 and
P3 at once" reports were all the same bug. `navigator.getGamepads()` was
reporting **two** entries for what the user believed was one controller.
Decoding the actual IDs the user pasted:

- `"Unknown Gamepad (Vendor: 1532 Product: 02b0)"`, `mapping: ""` -
  vendor `1532` is Razer. Almost certainly a Razer mouse or other
  peripheral that Chrome's Gamepad API mis-enumerates as a "gamepad" - a
  known, documented quirk with programmable-button peripherals, not
  anything specific to this user's setup.
- `"HID-konformer Gamecontroller (STANDARD GAMEPAD Vendor: 045e Product:
  0b13)"`, `mapping: "standard"` - vendor `045e` is Microsoft; this is
  the real Xbox controller.

`systems/GamepadAssignment.ts`'s connection-order logic has no way to
tell these apart by count alone - it just saw "2 gamepads" and handed
index 0 (the phantom, browser-enumeration order, not plug-in order) to
whichever slot claimed a gamepad first, leaving that slot permanently
dead while whichever slot got index 1 (the real pad) worked fine. This
explains every prior report: which slot ended up "cursed" with the
phantom depended only on toggle order and slot layout, not anything
actually wrong with those slots.

New `systems/GamepadDetection.ts`, `filterStandardGamepads()` - keeps
only entries where the browser's own `mapping === 'standard'`, the
Gamepad API's own signal that it recognized the device's button/axis
layout as an actual game controller (non-controller HID peripherals
essentially never report this, even when picked up at all). Not a
Debris-specific heuristic - the standard way web games are expected to
filter Gamepad API noise. Had to reach through Phaser's own `Gamepad`
wrapper to its `.pad` reference (the raw native browser object) to read
`mapping` at all - Phaser's wrapper class doesn't expose that field
itself, and its own `.d.ts` doesn't declare it either (typed `pad: any`).
Applied at both call sites that count/index into connected gamepads:
`GameScene.buildPlayers()` (the actual per-round assignment) and
`MenuScene.refreshCardStatus()` (the READY/WAITING cards, so the menu's
promise matches what the round actually delivers).

### Verified

- `npx tsc --noEmit`, `npx eslint .` both clean.
- `npx vitest run`: 58/58 passing (up from 55) - new
  `tests/gamepadDetection.test.ts` covers keeping a standard-mapped pad,
  dropping an empty-mapping one (the exact Razer-as-gamepad shape from
  this report), and preserving order in a mixed list. Testable as pure
  logic despite operating on a Phaser type, since `GamepadDetection.ts`
  only imports `Phaser` as a type (erased at compile time) - the test
  never actually loads the real `phaser` package, which crashes outright
  in this project's `node`-environment test runner (see the previous
  entry's note on `PhaserGamepadPatch.ts`).
- `npm run build` clean (47 modules).

### Not done yet

Not verified against the actual hardware that surfaced this - confirmed
by decoding the vendor/product IDs the user pasted from
`navigator.getGamepads()` and confirming Phaser's `Gamepad.pad.mapping`
is the real underlying field, not by watching the fix work live. Needs
the user to hard-refresh (this only takes effect on a fresh load, same
caveat as the previous entry) and confirm the real Xbox controller now
consistently lands on P1 after toggling it, in both Cooperative and
Single Player.

---

## 2026-08-24 — Fixed a real Phaser bug crashing every Menu → Game transition with a gamepad connected

### What was built

A user-reported crash, real hardware in hand (a genuine Xbox controller,
not a generic pad this time): toggling P1 to gamepad in Single Player and
pressing Start froze the game outright. Console showed `Uncaught
TypeError: Cannot read properties of undefined (reading
'removeAllListeners')` thrown from inside `phaser.js` itself - not our
code, confirmed by reading Phaser 3.90's own source
(`node_modules/phaser/src/input/gamepad/GamepadPlugin.js`).

Root cause: `GamepadPlugin.stopListeners()` (called from
`GamepadPlugin.shutdown()`, which fires on every outgoing scene during a
`scene.start()` transition - exactly "press Start" on the menu) loops
`this.gamepads` up to `.length` and calls `.removeAllListeners()` on each
entry with **no hole-check** - unlike every other method in the same
file (`getAll()`, `refreshPads()`'s own loop), which do guard with
`if (pads[i])` first. `this.gamepads` is indexed by the browser's own
raw `Gamepad.index` (`refreshPads()`'s `currentPads[index] = newPad`),
which is **not** guaranteed to start at 0 - whatever index this
particular controller/USB port/driver combination happened to report it
at, that's the index Phaser stores it under, leaving lower indices
`undefined`. `disconnectAll()` has the identical unguarded pattern.
This also retroactively explains the earlier "gamepad recognized for P1
and P3 at once" report from a different controller - consistent with
that device enumerating at a non-zero or even duplicate index.

New `systems/PhaserGamepadPatch.ts`, `patchPhaserGamepadHoleBug()` -
called once in `main.ts` before the `Phaser.Game` instance is created (so
every Scene's own `GamepadPlugin` instance inherits the fix from the
shared prototype). Patches by compacting `this.gamepads` (dropping holes
via `.filter(Boolean)`) immediately before calling through to the real
`stopListeners`/`disconnectAll`, rather than reimplementing either
method's body - stays resilient to Phaser's internal wiring changing
under an unrelated future upgrade instead of silently drifting out of
sync with it. `stopListeners` needed a small TS escape hatch
(`GamepadPluginInternals`) since it's real at runtime but marked
`@private` and omitted from Phaser's generated `.d.ts` entirely -
`disconnectAll` is a documented public method and didn't need one.

### Verified

- `npx tsc --noEmit`, `npx eslint .` both clean.
- `npx vitest run`: 55/55 passing, unchanged - this patches a real
  `Phaser` class's prototype at runtime, and `Phaser` cannot even be
  imported in this project's `node`-environment test runner (confirmed:
  attempting to `require('phaser')` outside a browser throws `window is
  not defined` in `node_modules/phaser/src/device/OS.js`) - there is no
  way to unit-test this in the current Vitest config, consistent with the
  project's "pragmatic mix" convention of not force-testing
  Phaser-integration code.
- `npm run build` clean (46 modules).

### Not done yet

**Not verified against the actual failing hardware** - this environment
has no gamepad access, so the fix is verified by reading Phaser's source
against the user's exact stack trace and confirming the patched methods
now skip holes instead of indexing into them blindly, not by reproducing
the crash and watching it stop. Needs the user to hard-refresh (this
patch runs at module load, before `Phaser.Game` is constructed - a
long-running dev-server tab won't pick it up without a real reload, not
just Vite's HMR) and retry the exact repro (Xbox controller connected,
P1 toggled to gamepad in Single Player, press Start).

---

## 2026-08-24 — Single Player mode

### What was built

A new third mode, not previously scoped in `docs/roadmap.md` - added on
request. Scoped via `AskUserQuestion` rather than guessed, on three
questions: where it lives in the menu (a third option on the existing
mode toggle, not a separate entry point), what actually distinguishes it
from just playing Cooperative alone (personal high-score tracking +
locked to exactly one ship), and how a round ends (same as today - game
over at 0 lives, nothing exotic).

`systems/RoundOutcome.ts`'s `GameMode` gained `'singlePlayer'` as a third
literal. No new branch was needed in `evaluateRoundOutcome` itself -
Single Player reuses Cooperative's exact "loss at zero, otherwise
continue" rule, since with one locked ship "everyone's out of lives" and
"the one player is out of lives" are the same check. A new shared
`GAME_MODE_LABELS` map (also in `RoundOutcome.ts`) gives both `MenuScene`
and `GameScene`'s HUD the same display strings, fixing a latent bug the
naive `mode.toUpperCase()` approach would've had for this mode
specifically (`'singlePlayer'.toUpperCase()` reads `SINGLEPLAYER`, no
space).

**Locked to exactly one ship.** `GameScene.buildPlayers()` slices
`sources` to length 1 before computing slot assignments when
`mode === 'singlePlayer'`, so P2-P4's menu state is ignored outright, not
just hidden. `MenuScene` mirrors the lock visually: P2-P4's cards read
`LOCKED\nSINGLE PLAYER` regardless of their own source/readiness, and
P2's keyboard⇄gamepad toggle goes inert (P1's stays live - P1 always
plays in every mode). Solo play also spawns dead-center rather than at
P1's usual diamond corner (`GameScene.spawnOffsetFor`, shared by
`buildPlayers()` and the lives/respawn system's `processPendingRespawns`) -
the corner positions exist only to keep simultaneous players apart.

**Personal high score**, the mode's actual point. New
`systems/HighScore.ts` - same shape as Godspeed's `ProgressionStorage.ts`
(an injectable `StorageReader`/`StorageWriter` pair, pure `recordScore`
transform), not `AudioSettings.ts`'s module-singleton pattern, since
nothing needs this on every frame - `GameScene` just loads/records/saves
once, at round end. Persisted under a new namespaced key
(`rheinarts.debris.singlePlayerHighScore.v1`, separate from
`AudioSettings`' own key so the two don't collide). Shown on the
mode-select screen (`MenuScene`'s new `bestScoreText`, visible only while
Single Player is selected - meaningless for the other two modes) and
again on the GAME OVER screen at round end, with a "NEW HIGH SCORE!"
call-out replacing the usual `BEST ####` line when the run just beat it.

Also fixed in passing: `GameScene`'s class doc comment still said "Still
no lives/respawn system" - stale since the lives/respawn feature actually
landed two entries back and this comment was never updated then.
`docs/art_direction.md`'s note that the CRT overlay "isn't built yet" was
similarly stale after the previous entry actually built it - both
corrected here.

### Verified

- `npx tsc --noEmit`, `npx eslint .` both clean.
- `npx vitest run`: 55/55 passing (up from 49) - new `tests/highScore.test.ts`
  covers `loadHighScore` (empty/corrupt-JSON/round-trip) and `recordScore`
  (lower score keeps the record, a tie keeps it, a higher score raises it
  without mutating the input), same shape as Godspeed's own
  `progressionStorage.test.ts`.
- `npm run build` clean (45 modules).
- Dev-server smoke check: `npx vite --port 5175`, curled `/` (200),
  `/src/main.ts` (200), and `/src/systems/HighScore.ts` (200).

### Not done yet

Not seen running in an actual browser - the 3-way mode toggle's layout
fit (three labels including the longer "SINGLE PLAYER" in the space two
used to occupy), the LOCKED card styling, and the GAME OVER screen's
extra score/best-score lines are all reasoned from code, not observed.

---

## 2026-08-24 — CRT overlay, destruction shake/particles, splash logo

### What was built

Roadmap item 12, three of its four remaining pieces (scope decided via
`AskUserQuestion` - see "Not done yet"):

**CRT scanline/vignette overlay.** A direct port of HyperOut's own `.crt`
div (`hyperout/style.css`) into Debris's `index.html`: the same
`repeating-linear-gradient` scanlines + radial-gradient vignette,
`pointer-events: none`. Fixed to the viewport rather than scoped to the
canvas element - Debris uses `Phaser.Scale.FIT`, which can letterbox, and
a viewport-fixed overlay covers those bars too (same near-black as the
canvas background either way, so the seam is invisible). Applies to every
scene at once (Splash, Menu, Game) since it's one shared canvas, not
per-scene DOM like HyperOut has.

**Screen shake + particle bursts on destruction.** New
`entities/DestructionBurst.ts` - a one-shot burst of small fading dots,
implemented as a single hand-managed `Graphics` object redrawn each frame
(same pattern every other entity in this game already uses), not Phaser's
`ParticleEmitter` subsystem. Decided: particles are colored to match what
died (a player's own color for their ship, `COLORS.asteroid`'s neutral
grey-white, `COLORS.ufo`'s red) rather than a uniform spark color, and
screen shake scales by what died - ship and UFO destruction get
`EFFECTS.majorShake`, an asteroid popping gets the lighter
`EFFECTS.minorShake` - rather than one flat intensity for everything.
Wired into all three destruction sites: `destroyAsteroid`,
`processPendingShipHits` (a real, life-costing ship death, not a
shield-absorbed hit), and `processPendingUfoHits`. Camera shake checks
`prefers-reduced-motion` and no-ops if set, the same courtesy HyperOut's
own screen shake already extends (`game.js`'s `reduceMotion` check) -
particle bursts aren't gated by it, matching HyperOut's own scope there
(it only skips shake + decorative CSS animation, not its particle burst).
All tuning (counts, speed ranges, lifespans, shake intensity/duration) is
a new `EFFECTS` block in `GameConfig.ts` - starting guesses, not
playtested.

**Rhein Arts logo on `SplashScene`.** Matches HyperOut's own splash
screen exactly (`hyperout/index.html`'s `.splash-credit`/`.splash-logo`):
bottom-right, `right: 12%; bottom: 2.5%; width: 15%` of the splash art's
own box - in Debris that box is the full `ARENA_WIDTH`x`ARENA_HEIGHT`
canvas, since `splash.png` is cover-scaled to fill it edge to edge - at
~0.95 opacity, not interactive (Phaser images are non-interactive unless
`setInteractive()` is called, so no extra work needed for HyperOut's
`pointer-events: none` equivalent). `debris/game/src/assets/rhein-arts.png`
is a new copy of the existing `web/img/rhein-arts.png` - Debris didn't
have its own before this.

### Verified

- `npx tsc --noEmit`, `npx eslint .` both clean.
- `npx vitest run`: 49/49 passing, unchanged - every piece landed here is
  Matter/Phaser-rendering-shaped (particles, camera shake, DOM overlay,
  image placement), not pure rule logic to extract, per this project's
  "pragmatic mix" testing convention.
- `npm run build` clean (44 modules, `rhein-arts.png` bundled at
  1.64MB - matches the source file, no compression regression).
- Dev-server smoke check: `npx vite --port 5175`, curled `/` (200),
  `/src/main.ts` (200), and `/src/assets/rhein-arts.png` (200).

### Not done yet

**Polish pass on the ship/asteroid/UFO shapes** - the fourth piece of
item 12 - was explicitly skipped this pass per the `AskUserQuestion`
answer: `docs/art_direction.md` never specified more than "any polish
pass," and a rendering-only glow/bloom pass vs. an actual geometry
refinement are different-enough scopes that picking one without a
clearer brief would've been guessing. Still open on the roadmap.

Not seen running in an actual browser - the shake intensity/duration,
particle counts/speeds/lifespans, the CRT overlay's exact look against a
real (possibly letterboxed) viewport, and the logo's placement/scale
against the actual `splash.png` art are all reasoned from code and
HyperOut's own values, not observed.

---

## 2026-08-24 — Lives, respawn, and invulnerability

### What was built

Roadmap item 5. Previously a single unshielded hit destroyed a ship
outright and ended the round on the spot - now each `PlayerSlot` carries
its own `lives` (starts at `GameConfig.ts`'s existing `LIVES_PER_PLAYER`,
3), spent independently per player even in Cooperative, where score is
still pooled but lives never were.

Sequencing (resolved via `AskUserQuestion`, since `docs/gameplay.md`'s
"respawns... after a brief invulnerability window" was genuinely
ambiguous on ordering): a hit destroys the ship immediately, and if the
player has lives left, queues a respawn - a `SHIP.respawnDelayMs` (1000ms,
new config value, a starting guess not playtested) dead beat, then a
brand-new `Ship` appears at the player's own original spawn point
(`PLAYER_SPAWN_OFFSETS`, the same diamond used at round start - not exact
arena-center, so 3-4 respawning players never stack on each other),
already invulnerable for the pre-existing `SHIP.respawnInvulnerabilityMs`
(2000ms). Also decided: an invulnerable ship can move/turn freely but
can't fire (`GameScene.update()` gates the fire check on
`!ship.isInvulnerable(nowMs)`, thrust/turn untouched) - the only visual
tell is `Ship.draw()` blinking the hull off every other 100ms while
invulnerable, same read as classic Asteroids' post-respawn flash.

`Ship` gained `isInvulnerable(nowMs)`/`grantInvulnerability(nowMs,
durationMs)`. `handleCollision`'s every damage path (asteroid ram, UFO
ram, UFO shot, Competitive friendly-fire shot, Competitive ship-ram) now
skips queuing a hit against an invulnerable ship - shield pickups and a
ship's own ability to deal damage are unaffected, only *receiving* damage
is gated. A destroyed-but-not-eliminated respawn is queued in a new
`pendingRespawns` array (same queued-mutation pattern as the existing
`pendingX` hit arrays) and drained each frame by a new
`processPendingRespawns`, not a Phaser `delayedCall`.

Round-outcome logic changed meaning, not shape: `aliveFlagsBySlot()` used
to mean "has a `Ship` object alive on screen this exact frame" - with
respawn delay, that would have falsely ended the round (or, in
Competitive, falsely declared a winner) the instant a still-alive player
got hit but before their respawn timer fired. It now means "has lives
remaining," so a player mid-respawn-delay correctly still counts as in
the fight. `pendingRespawns` is explicitly cleared the moment a round
actually ends, so an in-flight respawn timer from the finishing blow
can't pop a ghost ship in after the GAME OVER overlay is already up.

New HUD line under the score (`P1 ●●●   P2 ●○○`, filled = life held,
hollow = spent) shows every active player's remaining lives - lives are
otherwise invisible state, and unlike score they're never pooled even in
Cooperative.

### Verified

- `npx tsc --noEmit`, `npx eslint .` both clean.
- `npx vitest run`: 49/49 passing, unchanged - this feature is Matter/
  Phaser-integration-shaped (timers, ship lifecycle, collision gating),
  not pure rule logic to extract, per this project's "pragmatic mix"
  testing convention.
- `npm run build` clean (42 modules).
- Dev-server smoke check: `npx vite --port 5175`, curled `/` (200) and
  `/src/main.ts` (200).

### Not done yet

Not seen running in an actual browser - the respawn-delay pacing (does
1000ms read as "a beat" or "a stall"), the flicker rate, and the
lives-HUD glyphs (`●`/`○` rendering as intended in the monospace font)
are all reasoned from code, not observed. `docs/gameplay.md`'s original
spec doesn't say what happens to a Competitive ship-to-ship ram against
an invulnerable target's Matter body - it still physically bounces (no
change to collision response, only damage is skipped), which wasn't an
explicit ask but follows from "only receiving damage is gated."

---

## 2026-08-23 — Gamepad support (up to 4 players)

### What was built

Roadmap item 11. `input/GamepadInput.ts` is a new `PlayerInput`
implementation alongside `KeyboardInput`, reading the Standard Gamepad
API mapping from `docs/controls.md`: left stick X or D-pad left/right to
turn (D-pad wins if both disagree), right trigger (`buttons[7]`) to
thrust, bottom face button (`buttons[0]`) to fire. The turn-direction
logic is a pure function, `systems/GamepadInputMapping.ts`'s
`computeGamepadTurnDirection` (deadzone handling, D-pad-overrides-stick,
both-D-pad-directions-cancels-to-neutral - all tested).

`MenuScene`'s per-slot `sources` selection (already collected for the
menu's READY/WAITING cards, previously unused past that) now actually
reaches `GameScene` via `scene.start('Game', { mode, sources })`.
`GameScene.buildPlayers()` (new, replacing a chunk of `create()`) builds
however many ships are actually active - up to 4, not always exactly 2 -
from `sources` plus whatever gamepads are connected right now, via
`systems/GamepadAssignment.ts`'s `computeSlotAssignments` (a
generalization of the existing `computeGamepadReadiness` the menu cards
already used, so a slot reading WAITING on the menu can never silently
get a ship in-round). Spawn positions widened from the old fixed
two-point layout to a 4-point diamond (`PLAYER_SPAWN_OFFSETS`).

Making the roster genuinely variable-size surfaced a real correctness
bug before it shipped, not after: `winnerIndex`, the fire-budget filter,
self-hit immunity, and the score HUD were all trusting array
position as if it equaled player number, which breaks the moment any
slot is inactive (e.g. only P1 and P3 playing - P3 would score as if
they were "player 2"). Fixed by adding `PlayerSlot.slotIndex` as the one
stable per-round player identity and auditing every place that had
assumed array-index-equals-player-number.

`PlayerInput` gained an optional `destroy?()` so `GameScene`'s shutdown
handler can call it uniformly - `KeyboardInput` has real window listeners
to release, `GamepadInput` doesn't need to do anything.

### Verified

- `npx tsc --noEmit`, `npx eslint .` both clean.
- `npx vitest run`: 49/49 passing (up from 40) - new coverage for
  `computeSlotAssignments` (keyboard slots always ready with no gamepad
  index; sequential index assignment that skips keyboard slots; an
  unready slot gets `gamepadIndex: null`, not just `ready: false`) and
  `computeGamepadTurnDirection` (all six cases above).
- `npm run build` clean (42 modules).
- Dev-server smoke check: `npx vite --port 5175`, curled `/` (200) and
  `/src/main.ts` (200).

### Not done yet

Not seen running with an actual physical controller in a browser - no
way to plug in and press buttons in this environment, so the button/axis
indices are verified against Phaser's own `phaser.d.ts` types and
`docs/controls.md`'s spec, not observed input. Per `docs/controls.md`'s
own accepted simplification, a `GamepadInput` binds to one specific
`Gamepad` object at round start and doesn't attempt to recover from a
mid-round disconnect/reconnect - the same gap the menu's connection
detection already had.

---

## 2026-08-23 — Ships start facing north, not right

### What was built

Both ships spawned facing right - the hull's nose points along local +x
per `docs/art_direction.md`, and nothing had ever set an initial angle,
so the default Matter body angle (0) rendered as "facing right." Fixed
in `Ship.ts`'s constructor: `this.visual.setRotation(-Math.PI / 2)`
right after `setFixedRotation()` - every ship now starts facing north
(screen coordinates: angle 0 = right, +90° = down, so -90° = up),
matching thrust direction too since `Ship.update()`'s applied force
already uses the same `cos(angle)`/`sin(angle)` convention. A neutral
default that doesn't favor either player's starting side, particularly
relevant now that Competitive mode (previous entry) makes the two ships'
relative facing actually matter.

### Verified

- `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (40/40, unchanged
  - this isn't pure rule logic, no new test), `npm run build` all clean.

### Not done yet

Not seen in an actual browser - the exact on-screen "up" read (does the
Interceptor silhouette look right pointing north, same as it does
pointing right) is reasoned from the angle convention, not observed.

---

## 2026-08-23 — Roadmap: Rhein Arts logo on the splash screen

### What was built

Docs-only. Added to `docs/roadmap.md` item 12 (the visual-polish item
that already tracks the other still-missing pieces, like the CRT overlay
and screen shake) rather than inventing a new checklist entry: a Rhein
Arts logo watermark on `SplashScene`'s lower-right corner, matching
HyperOut's own splash screen. Read HyperOut's actual implementation
first rather than guessing at "like HyperOut" - `hyperout/index.html`'s
`.splash-credit`/`.splash-logo` and the corresponding CSS in
`hyperout/style.css`: `web/img/rhein-arts.png`, positioned `right: 12%;
bottom: 2.5%; width: 15%` relative to the splash art's own box (not the
full viewport), ~0.95 opacity, `pointer-events: none` (pure watermark,
never intercepts clicks). Noted that Debris doesn't have its own copy of
that logo asset yet - `web/img/` has one, `debris/game/src/assets/`
doesn't - so copying it in is part of the actual work, not assumed
already available.

### Verified

N/A - documentation only, no code touched.

### Not done yet

The logo placement itself - this is a roadmap entry, not an
implementation. Whoever picks it up next should position it
proportionally against `SplashScene`'s cover-fit `splash.png` render
(see `SplashScene.ts`'s existing `cover` scale calculation), not the
raw viewport, to match HyperOut's percentage-of-artwork approach rather
than a fixed-pixel one that could sit wrong at different aspect ratios.

---

## 2026-08-23 — Mode selection consumed; Competitive mode

### What was built

`MenuScene`'s mode toggle stopped being decorative - `GameScene` now
receives it (`scene.start('Game', { mode })`, read via Phaser's
`init(data)` lifecycle hook) and Cooperative/Competitive actually behave
differently, per `docs/gameplay.md`'s already-decided "Modes" section:

- **`GameMode` moved to a new `systems/RoundOutcome.ts`**, not left
  defined inside `MenuScene.ts` - a systems file needing to import a
  type from a scene file would be the wrong dependency direction, and
  both `MenuScene` and `GameScene` need it now.
- **No friendly fire is structural in Cooperative, not just a rule
  nobody trained**: `Ship` gained a `shipCollisionEnabled` constructor
  param - Cooperative excludes `CATEGORY.SHIP` from a ship's own Matter
  mask entirely (ships pass through each other, matching "harmlessly" in
  the docs literally, not just "no damage"), Competitive leaves it in.
  `Projectile` gained a matching `hitsShips` param controlling whether
  `CATEGORY.SHIP` is in *its* mask.
- **Friendly fire in Competitive, with a self-hit bug caught before it
  shipped**: a shot spawns at exactly its own ship's position, so once
  `Projectile.hitsShips` is true, the very first physics step would
  otherwise register the shooter hitting themselves. Fixed by comparing
  the hit ship against the projectile's own `ownerIndex` in
  `handleCollision` and simply not queuing that pair - enemy shots still
  register normally.
- **Ship-to-ship ramming is mutually lethal in Competitive** - a new
  collision branch checks for two `Ship` instances directly (the
  existing single-`ship`-variable extraction pattern only ever resolves
  *one* side of a pair, the same class of gap fixed for UFO-vs-ship
  ramming a few entries back), queuing both into the existing
  `pendingShipHits` path so shields still apply individually per ship.
- **Round-over is mode-aware and pulled out into a pure, tested rule**:
  `systems/RoundOutcome.ts`'s `evaluateRoundOutcome(aliveFlags, mode)` -
  Cooperative ends on total loss (every ship gone, unchanged from
  before), Competitive ends the instant only one ship remains
  (`{ status: 'win', winnerIndex }`), and also handles the draw edge
  case where the last two ships go down in the same frame. `GameScene`
  builds the "PLAYER N WINS" / "DRAW" / "GAME OVER" overlay text from
  whichever outcome comes back, instead of a single hardcoded message.
- **Per-player score in Competitive, pooled in Cooperative** - the old
  single `score: number` field became `scores: number[]`, attributed via
  the scoring projectile's own `ownerIndex` (`awardScore(ownerIndex,
  amount)`). The HUD (`refreshScoreText()`) shows `SCORE 460` in
  Cooperative (summed) or `P1 120   P2 340` in Competitive (separate) -
  matches docs/gameplay.md's "each player's own score is tracked and
  shown" for Competitive exactly, not a guess. A small mode label
  (`COOPERATIVE`/`COMPETITIVE`) was added top-right of the HUD too, cheap
  and makes the feature visibly confirmable.
- **`scene.restart()` now always carries `{ mode: this.mode }` explicitly**
  (the pause menu's Restart button, and the game-over/win/draw overlay's
  restart) - not relying on whatever implicit data-carrying behavior
  Phaser's `restart()` may or may not have, since losing the chosen mode
  on restart would be a real regression, not a cosmetic one.

### Verified

- `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (40/40 - 5 new
  tests for `evaluateRoundOutcome`'s continue/win/draw/loss branches),
  `npm run build` all clean.

### Not done yet

- **Not played in an actual browser.** Two-ship friendly fire, the
  self-hit-immunity fix, and the win/draw overlays are all reasoned
  through and covered by the pure-logic tests where testable, but the
  actual Matter collision behavior (does a ship genuinely pass through
  another in Cooperative, does the self-hit guard actually prevent the
  first-frame self-kill in practice) hasn't been observed.
- Still no lives/respawn system in either mode (roadmap item 5) - a hit
  is still permanent, not a life lost from a pool of 3.
- Competitive's Best-of-N round structure (explicitly a v1 nice-to-have
  per docs/gameplay.md) isn't built.
- Ship-vs-ship ramming and friendly-fire shots don't award score to the
  attacker - only asteroid/UFO kills do, since docs/gameplay.md doesn't
  specify eliminations should score (only says they decide the round
  outcome), and inventing a number wasn't the ask.

---

## 2026-08-23 — Roadmap: Bosses and Salvage progression added

### What was built

Docs-only. Three requested additions to `docs/roadmap.md`, checked
against what's already there before adding anything:

- **Gamepad support** was already tracked (v1 scope item 11) - not
  duplicated, just confirmed.
- **New "Bosses" future-idea entry** - the request wasn't a full spec,
  so it's recorded as a direction, cross-referencing the one boss
  concept that already existed (The Harvester, in the Enemy roster
  section), not expanded into invented mechanics.
- **New "Salvage" future-idea section** - the requested progression
  system (smallest-asteroid-kills drop salvage, spent on Engine and
  Weapon upgrade trees) written up in full, plus five open questions
  flagging real tensions rather than silently assuming answers: it
  conflicts with `docs/vision.md`'s explicit "not procedural/roguelite"
  pillar; "stronger braking" and "better boost" both imply new physics
  capabilities that don't exist in the current zero-friction/no-boost
  model (`docs/technical_design.md`'s `frictionAir: 0` decision); and
  whether Weapons unlocks stack or replace each other isn't specified.

### Verified

N/A - documentation only, no code touched.

### Not done yet

Everything in both new sections - these are future ideas, not scoped
work. Whoever picks either up needs to resolve the open questions listed
before implementation, not just start building.

---

## 2026-08-22 — Portal cabinet + k8s deployment wiring

### What was built

Debris now has a real cabinet on the `rheinarts.de` portal and builds
into the shared image, exactly mirroring Godspeed's own deployment
pattern (`node:22-alpine` build stage → `nginx:1.27-alpine` final stage)
rather than inventing a new one:

- **Root `Dockerfile`**: new `debris-build` stage
  (`FROM node:22-alpine`, `npm ci`, `npm run build`), `debris/music/`
  copied in as a sibling of `debris/game/` so `vite.config.ts`'s
  `publicDir: '../music'` resolves the same way in Docker as it does
  locally (identical trick to Godspeed's own music stage). Final stage
  gained `COPY --from=debris-build /app/dist/ /usr/share/nginx/html/debris/`.
- **`nginx.conf`**: `/debris` → `/debris/` redirect, same pattern as the
  existing HyperOut/Godspeed ones (the trailing-slash-less bare path
  needs to resolve to the game's own `index.html`).
- **`web/index.html`**: Debris now fills the portal's last remaining
  "coming soon" slot - `<span class="badge">PLAYABLE</span>` (the
  default badge style, cyan, no `.beta` modifier class) so it reads
  identically to HyperOut's badge, not Godspeed's orange `BETA` one.
  Thumbnail is `debris/artwork/splash.png` copied to `web/img/debris.png`
  - the same splash art already used in-game, not a new asset. Site
  `<meta description>`/Open Graph tags updated to mention all three
  games instead of just two.
- **`.dockerignore`**: added `debris/game/dist` alongside the existing
  `godspeed/game/dist` exclusion - a locally-built `dist/` (or
  `node_modules`, already covered by the generic `**/node_modules`
  pattern) must never leak into the image's own fresh
  `npm ci && npm run build`.
- **Docs**: root `README.md` (games list, project tree, run-locally
  section - also fixed a stale claim that Godspeed "isn't yet on the
  portal," which was no longer true independent of this work),
  `ROADMAP.md` ("Grow the arcade" - no "coming soon" slots remain now),
  `DEPLOYMENT.md` (serves-list, the Vite-build explanation now covers
  both Godspeed and Debris), `.claude/launch.json` (a `debris` dev-server
  config, port 5175, matching the `godspeed` entry's shape), and
  Debris's own `docs/technical_design.md` (its "not yet wired up for
  Debris specifically" deployment note was true until this entry -
  updated, along with confirming the UFO's score stays at 200 rather
  than still reading as an open question).
- **`k8s/rheinarts.yaml` needed no changes** - one shared image, one more
  served path under it, same as when Godspeed was added.

### Verified

This is the first Debris entry to verify an actual Docker build rather
than just `tsc`/`eslint`/`vitest`/`vite build` in isolation:

- `docker build --platform linux/amd64 -t rheinarts:debris-test .` from
  the repo root succeeded end-to-end - both the `godspeed-build` and new
  `debris-build` stages ran `npm ci && npm run build` cleanly (Debris:
  39 modules transformed, `tsc --noEmit` clean, all expected assets in
  the manifest), copied into the final nginx image.
- Ran the built image locally (`docker run`) and curled it: portal `/`
  (200), `/debris` → `/debris/` redirect (301), `/debris/` index (200),
  the bundled JS entry and a bundled SFX asset (`laser2-*.wav`, 200),
  both `debris/music/` tracks served via `publicDir`
  (`menu.mp3`/`neon-horizon.mp3`, 200), the portal's Debris card markup
  and its `img/debris.png` thumbnail (200), `/healthz` (200), and
  confirmed `/hyperout/` and `/godspeed/` still resolve unaffected (200
  each). Not just eyeballed the Dockerfile/nginx.conf - actually built
  and curled the running container, same standard Godspeed's own portal
  addition set.
- Test container and image removed after verification
  (`docker rm`/`docker rmi`) - nothing left running locally.

### Not done yet

- **Not pushed to GHCR, not applied to the cluster.** Building and
  verifying the image locally is as far as this goes unprompted -
  pushing to the registry and rolling the live Deployment needs
  credentials only the user has and touches shared/live infrastructure,
  exactly the kind of action this project's standing instructions say
  to leave to an explicit ask. `DEPLOYMENT.md`'s existing runbook (build
  → push → edit `k8s/rheinarts.yaml`'s tag → `kubectl apply`) covers the
  remaining steps.
- No screenshot-based thumbnail - `web/img/debris.png` reuses the splash
  art since there's no way to capture actual gameplay footage in this
  environment (no browser tool, same standing limitation as every other
  "not seen running" note in this changelog).

---

## 2026-08-22 — Volume settings persist across reloads

### What was built

Read `hyperout/game.js`'s actual `saveSettings`/`loadSettings` functions
directly (not going from memory) and replicated the same pattern in
`systems/AudioSettings.ts`: one JSON blob under a namespaced
`localStorage` key (`rheinarts.debris.v1`, matching HyperOut's own
`rheinarts.hyperout.v1` naming), loaded once when the module first
initializes (a plain module-level singleton - there's exactly one audio
session per page load), saved on every `setMusicVolume`/`setSfxVolume`
call. Both the load and save paths are wrapped in try/catch, same as
HyperOut's - a disabled/unavailable `localStorage` (private browsing,
quota, or simply not existing in this file's own Node-environment test
run) degrades to session-only instead of throwing, rather than crashing
the module at import time.

No call-site changes needed anywhere else - `MenuScene`'s sliders,
`GameScene`'s SFX/music playback, `SplashScene`'s menu-music start all
already went through `getMusicVolume`/`getSfxVolume`/`setMusicVolume`/
`setSfxVolume`, so persistence is a property of those functions now, not
something every caller had to opt into.

### Verified

- `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (35/35, unchanged
  - `AudioSettings`' existing 4 tests already exercise the clamping logic
  that persistence sits on top of, and pass in the Node test environment
  whether or not a `localStorage` global exists there), `npm run build`
  all clean.

### Not done yet

- **Not confirmed in an actual browser** that a value set, then reloaded,
  actually comes back - reasoned from matching HyperOut's proven pattern
  exactly, not observed here.
- Nothing else persists (high scores, last-picked mode, P1/P2 input
  source) - those remain separate, undecided roadmap items, not swept in
  under this one just because the mechanism now exists.

---

## 2026-08-22 — The UFO

### What was built

`docs/gameplay.md` had already decided the UFO's broad strokes (enters
from an edge, drifts on a fixed heading, wraps, fires a rough lead on the
nearest player, destroyable by shots/asteroids, "200+ points"), but left
several real implementation questions open. Asked before building
(`AskUserQuestion`, not guessed) and answered:

- **No cap on concurrent UFOs** - the spawn timer (`UFO.spawnIntervalMs`)
  fires regardless of whether an earlier UFO is still alive, so they can
  stack up if nothing kills them.
- **Ramming a UFO with a ship destroys both**, not just the ship - the
  ship's shield can still save the *ship* half of that (same shield
  semantics as an asteroid hit), but the UFO dies either way.
- **Aim spread is moderate**: the UFO's shot is a real single-pass
  lead-the-target prediction, then a uniform-random ±18° error
  (`UFO.aimSpreadRad`) on top - noticeably imperfect, dodgeable with
  movement, still a real threat standing still.
- **Score bonus stays at 200** - the original scaffold placeholder,
  confirmed rather than raised.

Built:

- **`entities/Ufo.ts`**: the "Classic Saucer" visual from
  `docs/art_direction.md` - a wide flattened body ellipse
  (`Graphics.fillEllipse`/`strokeEllipse`, no manual point math needed),
  a dome drawn as a manually-constructed top-half-ellipse polygon (Phaser
  has no built-in ellipse-arc primitive, so it's 16 parametric points
  from angle π to 2π - the top half in screen coordinates - closed by
  `closePath()`), and three under-lights pulsing on independent phase
  offsets. "Gently bob/tilt during flight" from the doc is implemented as
  a rotation wobble only (`setRotation` sine wave) - not literal position
  bobbing, which would mean fighting the Matter-tracked y position every
  frame for a subtle effect not worth that risk. Solid (non-sensor)
  Matter body, same pattern as `Ship`, category `UFO`, mask
  `SHIP | ASTEROID | PROJECTILE`.
- **`entities/UfoShot.ts`**: structurally identical to `Projectile`
  (constant velocity, wraps, expires, sensor) but deliberately its own
  class, not a generalized/shared one - a UFO shot only ever targets a
  ship (never an asteroid, never `ownerIndex`-scoped like a player shot),
  different enough collision semantics that sharing a class would mean
  threading UFO-only concerns through player-shot logic.
- **`systems/UfoTargeting.ts`**: two pure, tested functions -
  `computeLeadAimHeading` (single-pass intercept prediction: aim where
  the target *will be* after the shot's travel time, given its current
  velocity - "rough lead," not a full physics solve) and
  `applyAimSpread` (the ±18° random error). Pure rule logic gets tested
  per this project's established boundary (`tests/ufoTargeting.test.ts`).
- **New collision category, `UFO_SHOT` (0x0020)**, separate from `UFO`
  itself (0x0008) - keeps "something touched the UFO's body" and
  "something touched the UFO's shot" as distinct collision pairs.
  `Projectile`'s own mask gained `CATEGORY.UFO` (player shots can now
  actually hit it) alongside its existing `CATEGORY.ASTEROID`.
  `Ship` gained a `velocity` getter, needed for the lead calculation.
- **`GameScene` wiring**: `spawnUfo()` (random edge, heading within ±45°
  of straight-across, not a razor-straight cardinal line),
  `updateUfos()` (moves every UFO, then has each fire independently off
  its own cooldown via `nearestAliveShip()`), and two more deferred-
  processing queues (`pendingUfoHits`, `pendingUfoShotHits`) following
  the same "never mutate the Matter world inside the collision callback"
  discipline as every other entity type in this file.
- **No dedicated UFO SFX yet** (spawn, its own shot, a distinct
  destruction sound) - destroying one currently reuses
  `SHIP_DESTROYED_SFX_KEY` (a downed UFO is a bigger deal than a regular
  asteroid, so the bigger explosion sound, not silence or the asteroid
  one). Now the one remaining SFX gap, per `docs/roadmap.md`.

### Verified

- `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (35/35 - 5 new
  tests for `UfoTargeting`'s lead prediction and spread bounds), `npm
  run build` all clean.

### Not done yet

- **Not seen/played in an actual browser.** The dome's manually-built
  half-ellipse geometry, the under-light pulse timing, the aim-spread
  feel, and whether "no cap on concurrent UFOs" reads as escalating
  tension or overwhelming chaos are all reasoned through, not observed -
  this last one in particular was a real design call (the user picked
  "UFOs can stack up" over a max-1-at-a-time option) worth watching
  closely once it's actually playable.
- Dedicated UFO sound effects (see above).
- The UFO doesn't yet interact with Cooperative/Competitive mode logic
  (neither exists) or with `MenuScene`'s still-unconsumed selections.

---

## 2026-08-22 — Player 2 (keyboard)

### What was built

`GameScene` was built around a single `ship`/`input$` field pair since
the very first playable slice - this replaces both with a `players:
PlayerSlot[]` array (`{ ship, input, lastFiredAtMs }`), populated with
two entries in `create()`: P1 (`P1_BINDINGS`) spawns 150px left of
center, P2 (`P2_BINDINGS`) 150px right, so they don't start overlapping.
`update()`'s per-frame input/turn/thrust/fire logic now runs in a loop
over `players` instead of touching one ship directly.

- **Per-player fire limits, not shared.** The old single-ship code
  capped `this.projectiles.length` globally at `SHIP.maxOnScreenShots`;
  with two ships that would've meant one aggressive player could starve
  the other's ability to fire, which isn't a real design decision, just
  an accident of the old single-player code. `Projectile` gained a real
  `ownerIndex`, and each player's own fire-rate/on-screen-cap check now
  filters to `p.ownerIndex === ownerIndex` - each ship gets its own
  independent budget.
- **No friendly fire, by construction, not by a mode check.**
  `Projectile`'s collision mask was already `CATEGORY.ASTEROID` only (a
  shot has never been able to hit a ship, including your own) - so
  Cooperative-style "no friendly fire" just falls out of existing
  collision filtering with zero new code. Ships can still physically
  bump each other (harmless Matter collision response, no special
  handling needed - `handleCollision`'s ship/asteroid/shield branches
  simply don't match a ship-vs-ship pair).
- **The round now ends only once *both* ships are destroyed**, not the
  first one - `processPendingShipHits` (renamed from the singular
  `processPendingShipHit`) destroys individual ships as their hits come
  in, and only calls `enterGameOver()` once
  `players.every(p => !p.ship.isAlive)`. A ship that dies just vanishes;
  the surviving player keeps playing solo for the rest of the round -
  the simplest thing that works without inventing lives/respawn logic
  that isn't built yet (roadmap item 5).
- **Shield pickups now grant to whichever ship actually touched them.**
  `pendingShieldPickups` changed from `Shield[]` to
  `{ ship: Shield }[]` - the old code always granted to `this.ship`
  (there was only ever one), which would've been a real bug the moment
  a second ship existed.
- **One shared thrust-sound loop, not per-ship.** Tried and discarded a
  per-player version - two independent engine-hum instances would just
  overlap into noise for two ships sitting near each other, which is how
  the sound already reads regardless. `wasAnyThrusting` (renamed from
  `wasThrusting`) now tracks whether *any* alive ship is currently
  thrusting and edge-detects the shared loop's play/stop off that
  aggregate, same idempotent-restart behavior as before.
- Score stays a single shared value - no per-player split, matches the
  one `SCORE` HUD readout already there.

### Verified

- `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (30/30, unchanged
  - this is Phaser scene wiring, no new pure rule logic), `npm run build`
  all clean.

### Not done yet

- **Not seen/played in an actual browser.** Two-ship collision handling,
  the shared thrust sound with two ships thrusting at once, and the
  "round ends only when both are dead" flow are all reasoned through,
  not observed.
- Both ships are keyboard-only regardless of `MenuScene`'s P1/P2
  gamepad toggle - that selection still isn't consumed anywhere
  (roadmap item 9's remaining gap, and item 11 for gamepad input itself).
- No Cooperative/Competitive mode *logic* - what's here is closest to
  Cooperative by default (see the class doc comment), but there's still
  no actual mode switch, and Competitive's "friendly fire on, last ship
  standing" isn't built at all.

---

## 2026-08-22 — Menu crash fixed, real black-border root cause, functional volume, trimmed background

### What was built

Five requested items, the first being an actual bug hunt:

- **Fixed the "Main Menu" crash.** Root cause: `MenuScene`'s
  `cardStatusTexts`/`cardBorders` arrays were never reset in `create()`.
  This scene instance persists across `scene.start()` cycles (no fresh
  constructor call), and `createPlayerCards()` **pushes** onto those
  arrays every time it runs - so the second time `MenuScene` ran (the
  first time anything ever returned to it, via the new "Main Menu"
  button), the old already-destroyed Text/Rectangle objects stayed at
  indices 0-3 while the new ones landed at 4-7, and `refreshCardStatus()`
  (called every frame) kept calling `.setText()`/`.setColor()`/
  `.setAlpha()` on those destroyed indices-0-3 objects - the same class
  of bug as GameScene's restart-state-leak fix from a few entries back,
  just in a scene that had never had a way back into it until now. Fixed
  by resetting both arrays at the top of `create()`.
- **Found the real "black borders" cause.** Not a color/style typo -
  Phaser's `Text` `backgroundColor` renders as a canvas texture, and
  canvas textures bleed a dark fringe at their edges once the game
  canvas is scaled (`Phaser.Scale.FIT` always scales it here). Fixed at
  the root, not patched: every button in `MenuScene` and `GameScene`'s
  pause menu now uses an explicit `Rectangle` + `Text` pair instead of
  `Text`'s `backgroundColor` - a vector shape, no texture-edge bleeding
  possible. This was already the pattern the player cards used
  successfully; generalized to the mode toggle, Start button, pause-menu
  buttons, and quit-confirm buttons.
- **`MenuScene` redesigned for the current 1920×1200 arena.** Its layout
  was still sized for the original 960×600 design (title at `y: 60`,
  200×150 player cards, etc.) - tiny and clustered in the corner of the
  now-4x-larger canvas. Rebuilt at a clean 2x scale throughout (title
  128px at `y: 120`, 400×300 cards, etc.), filling the arena properly
  instead of leaving most of it dead space.
- **Menu volume sliders are now functional**, not inert placeholders.
  New `systems/AudioSettings.ts` - a small module-level singleton (one
  audio session per page load, nothing to construct) holding
  `musicVolume`/`sfxVolume` (defaults 50%/70%, matching HyperOut's own
  pause-menu slider defaults), session-only (no `localStorage` yet).
  `MenuScene`'s sliders are real drag targets (Phaser's native
  `setInteractive({ draggable: true })` + `input.setDraggable`, plus a
  click-to-jump rail) that persist the value and update whatever's
  currently playing live. `LoopingSound.ts` gained a `setVolume` helper
  (a `Phaser.Sound.BaseSound` → `WebAudioSound` cast lives in exactly one
  place now, since `BaseSound`'s own type has no `volume`/`setVolume` at
  all - only its concrete subclasses do, which is what every sound
  actually is at runtime) and `playLoopingSound` now takes a required
  `volume` parameter. Every `this.sound.play(...)` one-shot in
  `GameScene` now passes `{ volume: getSfxVolume() }` too.
- **Background trimmed**: the nebula wash is gone entirely, and the
  procedural moon is replaced by a second real photo, `jupiter.jpg`
  (640×640, copied into `src/assets/` and circular-clipped exactly like
  Earth, smaller radius, lower-left - same slot the moon used to occupy).
  `entities/Background.ts` lost `drawNebula`/`drawMoon` and gained a
  shared `drawPlanetPhoto` helper that both Earth and Jupiter now call.
  `docs/art_direction.md`'s "Twin Planets + Nebula Haze" section heading
  (and its one other cross-reference, in the Start-screen section) is
  now just "Twin Planets" - renamed rather than left stale.

### Verified

- `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (30/30 - 4 new
  tests for `AudioSettings`' clamping/independence), `npm run build` all
  clean.
- Confirmed `dist/assets/jupiter-*.jpg` exists post-build alongside the
  other bundled assets.

### Not done yet

- **Not seen/heard in an actual browser.** The Main Menu crash fix and
  the black-border root cause are both traced to specific, confident
  causes (not guessed), but "confident from code" isn't "confirmed by
  looking at it." The new menu layout's proportions, the slider drag
  feel, and Jupiter's size/position are all reasoned, not observed.
- No `localStorage` persistence for volume settings - resets to 50%/70%
  on every page load.

---

## 2026-08-22 — Escape-key menu navigation, replicated from HyperOut

### What was built

Read `hyperout/game.js`'s actual Escape handler and `hyperout/index.html`'s
`pauseMenu`/`quitMenu` panel markup directly (not going from memory or
guessing at the UX) and replicated the same state-machine exactly:

| HyperOut state | Escape does | Debris equivalent |
| --- | --- | --- |
| `MENU` | `openQuitConfirm()` | `MenuScene`, not confirming quit → show "QUIT GAME?" |
| `QUIT_CONFIRM` | `closeQuitConfirm()` | `MenuScene`, confirming quit → hide it |
| `PLAYING` | `pauseGame()` | `GameScene`, `'playing'` → `'paused'` |
| `PAUSED` | `resumeGame()` | `GameScene`, `'paused'` → `'playing'` |

- **`MenuScene`**: a persistent `keydown-ESC` listener toggles a new
  `confirmingQuit` flag, showing/hiding an opaque full-screen backdrop +
  "QUIT GAME?" / YES / NO (YES navigates to `/`, same "only resolves once
  deployed behind the portal" caveat as HyperOut's own `quitToPortal()`).
  The backdrop is `setInteractive()` so it also blocks clicks reaching
  the mode toggle/player cards/Start underneath - since MenuScene's
  elements aren't grouped in one container to hide/show as a unit, unlike
  HyperOut's actual DOM panels. Also added `if (this.confirmingQuit)
  return;` guards to every other click/Enter/Space handler, since a
  visual backdrop alone doesn't block keyboard shortcuts.
- **`GameScene`**: a new `'paused'` `SessionState`, entered by the same
  persistent Escape listener (only acts when `state` is exactly
  `'playing'` or `'paused'` - no effect during `'stageClear'`/
  `'gameOver'`, which still only respond to "any key" advancing them,
  unchanged). `enterPaused()` mirrors HyperOut's `pauseGame()` closely:
  `this.matter.world.pause()` (a real Phaser/Matter API - "a paused
  world will not run any simulations" - actually freezes physics, not
  just my own per-frame bookkeeping), stops the thrust-sound loop and
  resets `wasThrusting` (mirrors `muteEngines()` + the `boostHeld` reset,
  so resuming can't inherit a stuck thrust sound), and pauses (not stops)
  the gameplay music track. Shows "PAUSED" with Continue/Restart/Main
  Menu buttons - matching HyperOut's `pauseMenu` panel, deliberately
  skipping its live music/SFX volume sliders (Debris has no working
  volume system anywhere yet; real sliders here would be misleadingly
  the one functional control on the screen). Continue/Restart/Main Menu
  are click-only, matching HyperOut exactly (it has no keyboard
  shortcuts for them either).
- **`this.matter.world.pause()`/`.resume()` also added to the existing
  `enterStageClear()`/`beginNextLevel()`/`enterGameOver()`** - not
  strictly requested, but the same reasoning applies: those states were
  already meant to freeze gameplay, but Matter's own simulation doesn't
  know about a scene's custom state flag and would keep silently
  stepping (asteroids drifting, stale collision pairs still possible)
  during what's supposed to be a frozen overlay. Actually pausing the
  physics world is what makes "frozen" true, not just "my code stopped
  calling `.update()` on things."
- **`audio/LoopingSound.ts` gained `pauseSound`/`resumeSound`**, ported
  from Godspeed's original `MusicController.ts` (which had them; Debris's
  port deliberately left them out early on as "nothing calls them yet" -
  now something does). Distinct from `stopSound`: resuming picks back up
  from where it paused, not from the beginning - what pausing gameplay
  music actually needs, unlike the thrust sound's "always restart"
  requirement from a few entries ago.
- **`docs/controls.md`'s "Menu / system" section** - previously a
  placeholder ("not fixed here since there's no menu screen built yet") -
  now documents the actual `Esc` table above, replacing the placeholder
  with what's real. `docs/roadmap.md` item 9 updated to note it landed.

### Verified

- `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (26/26, unchanged
  - this is all Phaser scene/state wiring, no new pure rule logic), `npm
  run build` all clean.

### Not done yet

- **Not seen/heard in an actual browser.** In particular: whether
  `matter.world.pause()` mid-frame (called from inside `update()`, not a
  Matter event callback) has any visible hitch, whether the pause-menu
  backdrop's opacity reads well over frozen gameplay, and whether the
  quit-confirm backdrop actually blocks every click it's supposed to are
  all reasoned from the API docs and code, not observed.
- No keyboard/gamepad shortcuts for Restart/Main Menu or quit YES/NO -
  matches HyperOut's own scope exactly (click-only), not an oversight,
  but worth reconsidering given Debris already supports gamepad menus
  more broadly than HyperOut ever did.
- `window.location.href = '/'` on quit is unverified outside a real
  portal deployment, same standing caveat HyperOut's own code carries.

---

## 2026-08-22 — Ship destruction, stage-cleared flow, Shield power-up, play-field background

### What was built

Four requested pieces landed together, since the first two share a new
session-state machine:

- **A `SessionState` (`'playing' | 'stageClear' | 'gameOver'`) in
  `GameScene`.** All normal per-frame gameplay logic (input, ship/
  asteroid/projectile/shield updates, firing, wave-clear detection) is now
  gated behind `state === 'playing'` - during the other two states,
  everything freezes and a centered two-line overlay (`showOverlay`/
  `hideOverlay`) shows instead, waiting on the first keypress, gamepad
  button, or click (`waitForKeyPress`, mirroring `SplashScene`'s "any
  input" pattern).
- **Ship destruction**: an unshielded ship touching an asteroid now
  destroys the ship, plays `explosion2.wav`
  (`SHIP_DESTROYED_SFX_KEY`), stops the thrust loop if it was playing,
  and enters `'gameOver'` - "GAME OVER / PRESS ANY KEY TO RESTART",
  restarting via `this.scene.restart()`. Detected the same
  deferred-processing way as asteroid hits (`pendingShipHit`, processed
  in `update()`, never inside the Matter collision callback) for the
  same reason - see the last several entries' crash-fix lessons.
  **This is not the lives/respawn/invulnerability system from
  `docs/roadmap.md` item 5** - it's a simpler single-life stand-in
  (destroyed = round over), explicitly noted as such in the roadmap so
  it doesn't get mistaken for that item being done.
- **Stage cleared**: clearing all asteroids now pauses instead of
  instantly spawning the next wave - "STAGE CLEARED / PRESS ANY KEY FOR
  NEXT LEVEL" - and only spawns the next (larger) wave once a key/button/
  click advances past it.
- **`scene.restart()` surfaced a latent bug**: `GameScene`'s instance
  persists across a restart (no fresh constructor call), so several
  fields that were only ever set once, in the original `create()`, would
  have silently carried stale values (`lastFiredAtMs`, `wasThrusting`,
  the three pending-hit queues, `overlayTexts`) into a "fresh" restarted
  round. Added an explicit reset block for all of them in `create()`,
  since this is the first time `restart()` is ever actually called.
- **Shield power-up** (`src/entities/Shield.ts`): the "Diamond Core"
  visual decided in `docs/art_direction.md` (rotating diamond outline,
  independently pulsing center dot, both redrawn every frame since Matter
  handles the rotation transform but not the pulse), a sensor body
  (category `PICKUP`, mask `SHIP`) that drifts and wraps like everything
  else, spawning periodically (`SHIELD.spawnIntervalMs`, already
  configured; added `SHIELD.speed` for its drift). `Ship` gained
  `hasShield`/`grantShield`/`consumeShield` plus a thin sapphire ring
  drawn around the hull while charged. Semantics confirmed against
  Godspeed's actual `consumeShieldCharge` call site (not guessed): the
  shield absorbs exactly one hit, the ship survives with no life lost,
  the *asteroid* is unaffected (not destroyed) - a redundant pickup while
  already charged is still consumed (removed, SFX plays) but doesn't
  stack. `shield-up.wav` on pickup, also deferred-processed like the
  other collision outcomes.
- **Play-field background** (`src/entities/Background.ts`,
  `PlayfieldBackground`): the "Twin Planets + Nebula Haze" composition
  from `docs/art_direction.md` - two star layers, a low-opacity violet/
  cyan nebula wash (drawn from the existing player-color palette, not new
  colors), `earth.jpg` as a circular-clipped (Phaser `GeometryMask`)
  primary planet, and a small layered-circle procedural moon.
  **Redirected from the menu to the play field per explicit
  instruction** - `docs/art_direction.md` and `docs/roadmap.md` updated
  to describe this accurately rather than silently diverging from what
  they said. Instantiated first in `GameScene.create()` so it renders
  behind every gameplay entity (Phaser's display-list order), and
  `.update()`s every frame regardless of session state (cosmetic, no
  reason to freeze it during a pause overlay).
  **Simplified from the full spec**: only the near star layer actually
  drifts; both planets are static. The doc calls for "slow independent
  drift" on the planets too, but doing that for the real-photo Earth
  means moving its circular mask in lockstep with the image every frame
  - an extra per-frame failure mode for a subtle effect that couldn't be
  visually verified here anyway. Noted as a real gap in the roadmap, not
  swept under a "done."

### Verified

- `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (26/26, unchanged
  - all four features are Phaser/Matter-integration code, not pure rule
  logic, matching this project's established testing boundary), `npm run
  build` all clean.
- Confirmed `dist/assets/earth-*.jpg`, `explosion2-*.wav`, and
  `shield-up-*.wav` all exist post-build alongside the earlier SFX/image
  assets.

### Not done yet

- **Not seen/heard in an actual browser** - same standing caveat as
  every entry so far, and this is the largest single batch of unverified
  visual/audio work yet: the background composition's actual balance
  (whether the nebula reads as "quiet enough to fight in front of," per
  the original design doc's stated risk), the stage-cleared/game-over
  overlay's readability and timing, the shield ring's visibility against
  the ship's own stroke color, and the earth mask's clip quality are all
  reasoned from code, not observed.
- Real lives/respawn/invulnerability (roadmap item 5) still doesn't
  exist - ship destruction is single-life-and-restart, as noted above.
- Planet/moon drift, the CRT scanline overlay, and screen shake/particle
  bursts on destruction are still open (see roadmap item 12's updated
  note).

---

## 2026-08-22 — Thrust sound effect, tied to the actual key state

### What was built

- **`debris/sfx/drive.wav`** is now the ship's engine sound: plays while
  thrust is held, stops the instant it's released, and always restarts
  from the beginning on the next press rather than resuming. Copied into
  `src/assets/`, loaded in `BootScene.preload()` (`THRUST_SFX_KEY` in
  `systems/Sfx.ts`), same bundling approach as the other two SFX.
  `GameScene.update()` tracks a new `wasThrusting` field and compares it
  against `this.input$.isThrusting` each frame to detect the press/release
  *edges* (not just the held state) - `stopSound` then `playLoopingSound`
  on the press edge (the `stopSound` first guards against a fresh press
  landing before a very recent release's stop has taken effect),
  `stopSound` alone on the release edge. Also stopped on scene `shutdown`
  so it can't keep looping into whatever scene comes next.
- **Renamed `audio/MusicController.ts` → `audio/LoopingSound.ts`**
  (`playLoopingMusic`/`stopMusic` → `playLoopingSound`/`stopSound`,
  updated at all three call sites: `SplashScene`, `MenuScene`,
  `GameScene`). It was already generic under the hood (just Phaser's
  Sound Manager, `loop: true`, an `isPlaying` guard) - the thrust sound
  needing exactly the same play/stop-and-reset behavior, just triggered
  by key state instead of scene lifecycle, was a second real use case
  that justified the more accurate name rather than importing a
  "music" function for an engine sound.

### Verified

- `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (26/26, unchanged),
  `npm run build` all clean.
- Confirmed `dist/assets/drive-*.wav` exists post-build (5.3 MB - a
  much bigger file than the other two SFX; worth a compression pass
  later if load time becomes a concern, not addressed here).

### Not done yet

- **Not heard in an actual browser.** In particular, the exact
  press/release timing (whether the `stopSound`-before-`playLoopingSound`
  guard is even necessary in practice, whether restarting instantly reads
  as abrupt vs. natural) is reasoned, not felt.
- No fade-out on release - it's a hard stop, matching the "once released
  stop it" ask literally, but worth revisiting if it sounds jarring.

---

## 2026-08-22 — Fixed ship spinning forever after bumping an asteroid

### What was built

Bug: the ship would start spinning on its own after colliding with an
asteroid, and never stop. Cause: turning was designed to be 100%
kinematic (`docs/gameplay.md`: only `setRotation()` from player input
changes heading), but the ship's Matter body was never told that -
a physical collision that hits it off-center imparts a real angular
impulse, same as any other Matter body would get. With
`SHIP.frictionAir: 0` (set two entries ago, deliberately, so the ship
never loses *linear* speed on its own) that impulse also never damped
back out, since the same `frictionAir` value governs angular velocity
too in Matter's integration - so one off-center bump left it spinning
at a constant rate forever.

Fixed in `Ship.ts`'s constructor: `this.visual.setFixedRotation()` right
after the body is created - a real Phaser/Matter API (`Transform`
component, already part of the `MatterGameObject<T>` type this project
uses) that sets body inertia to `Infinity`, so collisions physically
cannot rotate the ship at all. `setRotation()` is unaffected by this -
it sets angle directly regardless of inertia - so player-driven turning
still works exactly as before.

### Verified

- `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (26/26, unchanged),
  `npm run build` all clean.

### Not done yet

- Not confirmed in a real browser, per every entry so far - reasoned from
  reading Phaser's `Transform` component types and Matter's own angle-
  integration code, not observed.

---

## 2026-08-22 — First sound effects: shot and asteroid-hit; longer shots

### What was built

- **SFX**: `debris/sfx/laser2.wav` (shot) and `debris/sfx/explosion1.wav`
  (asteroid destroyed by a shot), picked from several options already
  sitting in that folder. Copied into `src/assets/` and loaded via ES
  import in `BootScene.preload()`, same bundling approach as
  `splash.png` (Vite's default asset extension list already covers
  `.wav`) - unlike `Music.ts`'s tracks, these aren't going through the
  `debris/music/` `publicDir`, so a new `src/systems/Sfx.ts` holds just
  the two texture-key-style constants, not URLs. Played as one-shot,
  non-looping sounds via `this.sound.play(key)` (no shared/idempotent
  instance needed the way looping music needs - unlike
  `playLoopingMusic`, overlapping plays are fine and expected for rapid
  fire) - `GameScene.fireProjectile()` plays the shot SFX,
  `destroyAsteroid()` plays the hit SFX.
- **Longer shots**: `PROJECTILE.lifetimeMs` doubled, `900` → `1800` -
  shots travel/persist twice as long before expiring. `SHIP.maxOnScreenShots`
  was already `4` (set in the very first playable-slice pass), so the
  "only 4 shots" half of the ask needed no code change, just confirming
  it's already true.

### Verified

- `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (26/26, unchanged
  - no new pure logic here), `npm run build` all clean.
- Confirmed `dist/assets/laser2-*.wav` and `dist/assets/explosion1-*.wav`
  exist post-build (hashed, matching source file sizes).

### Not done yet

- **Not heard in an actual browser** - same standing caveat as every
  audio-related entry so far.
- No volume control wired to these SFX either (matches music - the
  start-screen sliders are still inert/visual only).
- The other 6 files in `debris/sfx/` (`laser1.wav`, `laser3.wav`,
  `explosion2-4.wav`, `boss.wav`, `drone.wav`) aren't wired to anything -
  `boss.wav`/`drone.wav` in particular read like they're meant for
  Debris's own future enemy roster (`docs/roadmap.md`'s "Future ideas"
  section) or possibly carried over from Godspeed by mistake, not
  something to guess about and wire in unprompted.

---

## 2026-08-22 — Ship no longer decelerates on its own (crash confirmed fixed)

### What was built

Crash confirmed fixed by the previous entry's changes. New feedback: the
ship was still bleeding speed after thrust let off, when it shouldn't
lose any - there's no air in space. `SHIP.frictionAir` was `0.02`
(deliberately close to Matter's small default air-drag, per
`docs/technical_design.md`'s "realistic drift" framing, but not actually
zero). Set to `0`: velocity now only changes from `applyForce` while
actively thrusting, never decays on its own. Matches
`docs/technical_design.md`'s "the original ship really does carry
momentum... with very little friction" more literally than the previous
"close to default" compromise did.

### Verified

- `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (26/26, unchanged),
  `npm run build` all clean.

### Not done yet

- Not felt in a real browser - zero friction plus the retuned
  `thrustForce` together are what determine actual "hard to control"
  feel, and that combination still hasn't been played.

---

## 2026-08-22 — Actual crash root cause found; thrust force fixed

### What was built

Second round of feedback: shooting itself no longer crashed, but hitting
an asteroid with a shot still did, and the ship accelerated far too fast.
Both traced to real bugs, not just tuning.

- **The real "crash on hit" bug**: the previous entry's `pendingHits`
  deferral fixed a genuine risk (mutating the Matter world mid-step) but
  missed the actual cause. `GameScene.update()` calls
  `processPendingHits()` (which destroys the hit asteroid and spawns its
  split children) *before* the per-entity `forEach(update)` loops - but
  the dead-entity filter (`this.asteroids.filter(a => a.isAlive)`) ran
  *after* those loops, at the bottom of `update()`. So in the same frame
  an asteroid died, its `update()` still ran on it - calling Phaser
  `Graphics`/GameObject methods on an object that had already had
  `.destroy()` called on it, which throws. Fixed by moving both filters
  to run immediately after `processPendingHits()`, before anything else
  touches that frame's entity list (the original end-of-`update()`
  filters stay too, for projectiles that expire from their own lifetime
  mid-`update()`).
- **Ship accelerating far too fast**: a Matter.js integration detail I'd
  missed entirely. `Body.update()`'s Verlet integration does
  `velocity += (force / mass) * deltaTimeSquared`, and `deltaTime` there
  is in **milliseconds** (~16.67 by default) - so `deltaTimeSquared` is
  ~278, not ~1. `SHIP.thrustForce: 0.0018` was already probably too
  strong even before this session, but the arena-rescale's `SHIP.radius`
  16→8 quartered the ship's mass (`mass = density * area`, area ∝
  radius²) on top of that, quadrupling acceleration for the same force -
  reaching `maxSpeed` in roughly one frame. Fixed: `thrustForce` →
  `0.00003`, now reaching max speed over roughly 2-3 seconds of
  continuous thrust instead of instantly. Documented both gotchas
  directly in `GameConfig.ts` next to `SHIP`, same as the earlier
  velocity-units note.

### Verified

- `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (26/26, unchanged),
  `npm run build` all clean.

### Not done yet

- **Still not confirmed in a real browser.** Both fixes are reasoned from
  actually reading Matter's integration code this time (not inference
  from symptoms alone), so confidence is higher than the previous
  entry's crash fix - but "reasoned from source" isn't "seen working."
  If the crash or the acceleration feel is still off, the DevTools
  console (F12) remains the fastest way to pin down what's actually
  happening rather than another round of code-reading.
- `thrustForce: 0.00003` is a first estimate for "roughly 2-3s to max
  speed," not validated by feel - may still need retuning once played.

---

## 2026-08-22 — First real playtest fixes: arena size, a Matter velocity-unit bug, shoot crash

### What was built

First feedback from an actual browser session (everything before this was
structural verification only), three reported issues:

- **"Area must be 4x as big, scale ships and rocks down accordingly."**
  `ARENA_WIDTH`/`ARENA_HEIGHT`: 960×600 → 1920×1200 (2x each axis = 4x
  area). `SHIP.radius` 16→8, `SHIP_HULL_SCALE` 22→11, `ASTEROID` radii
  46/28/15 → 23/14/8. `spawnWave`'s spawn-ring distance in `GameScene.ts`
  scaled 2x (150-400 → 300-800) to match, so waves still spawn in a
  sensible ring around a now-bigger center instead of bunching near the
  old-arena-sized origin.
- **"Rocks are way too fast."** Root cause, not just retuning: Matter's
  `Body.update()` does `position += velocity` once per **physics tick**,
  and `setVelocity(x, y)` assigns that vector directly (confirmed by
  reading `node_modules/phaser/src/physics/matter-js/lib/body/Body.js`) -
  so a value fed into `setVelocity` is pixels-per-tick, and at Phaser's
  default 60 ticks/sec, real on-screen speed is roughly `value * 60`.
  `SHIP.maxSpeed` was already documented correctly ("px/step"); the
  `ASTEROID`/`UFO`/`PROJECTILE` speed constants weren't - they were sized
  as if `px/sec` and fed straight into `setVelocity`, making rocks ~60x
  faster on screen than intended (e.g. `large.speed: 40` meant ~2400
  px/sec across a then-960px-wide arena). Fixed by converting every one
  of those constants to real per-tick units (divide the old, intended
  px/sec by ~60) and documenting the gotcha directly in `GameConfig.ts`
  so `UFO`/`SHIELD` don't inherit it when they're actually wired in later.
- **"When I shoot, the game crashes."** Two independent contributing
  factors, both fixed:
  1. The velocity-unit bug above meant `PROJECTILE.speed: 480` was
     actually ~28,800 px/sec - an extreme value plausible enough to
     produce `NaN`/`Infinity` positions on collision resolution, which
     would then crash `Graphics`/`Arc` rendering (canvas APIs throw on
     non-finite coordinates). Fixed by the same unit correction
     (`PROJECTILE.speed` → `8`, ~480 px/sec, matching its old comment's
     *intended* value).
  2. Independent of that: `GameScene`'s `'collisionstart'` handler was
     directly calling `destroyAsteroid()`, which destroys Matter bodies
     and creates new ones (the split children) - synchronously, while
     Matter is still mid-step iterating its own collision pairs. Matter
     doesn't reliably tolerate the world being mutated from inside its
     own event dispatch. Fixed by queuing hits in a new `pendingHits`
     array during the event and only actually destroying/spawning bodies
     in `update()`, one frame layer removed from Matter's internals - a
     one-tick (~16ms) delay, imperceptible, but no longer mutating the
     world mid-step.

### Verified

- `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (26/26, unchanged),
  `npm run build` all clean.

### Not done yet

- **Still not confirmed in a real browser** - the crash fix is a
  well-reasoned code-review fix for the two most plausible causes I could
  find reading the collision/physics code, not a confirmed root-cause
  from an actual stack trace (this environment has no browser tool). If
  it still crashes, the browser DevTools console (F12 → Console) will
  show the actual uncaught error and stack trace, which would pin this
  down precisely instead of by inference.
- Ship speed/thrust/friction constants weren't touched in this pass -
  only what was reported (arena size, rock speed, the crash). Worth a
  separate look once the arena-size change is felt in a real session.

---

## 2026-08-22 — Splash screen and start menu (Boot → Splash → Menu → Game)

### What was built

The game no longer drops straight into gameplay. New flow:
`BootScene` (preload) → `SplashScene` → `MenuScene` → `GameScene`.

- **`SplashScene`**: user-provided `debris/artwork/splash.png` (copied to
  `src/assets/splash.png`, bundled/hashed by Vite like Godspeed's own
  image assets) rendered full-bleed with a cover-fit scale (`Math.max` of
  the two axis ratios, so a 1536×1024 source fills the 960×600 canvas
  without letterboxing). "PRESS ANY KEY" blinks at the bottom via a
  `Phaser.Tweens` alpha yoyo. Any keyboard key, gamepad button, or click
  advances to `Menu` (`this.input.keyboard/.gamepad/.` `once(...)`, each
  guarded by a single `advancing` flag so only the first input fires).
- **`MenuScene`**: the screen decided in `docs/art_direction.md` —
  glowing "DEBRIS" title, a control legend, a Cooperative/Competitive
  toggle, 4 player-status cards, inert volume-slider visuals, and an
  ungated Start (works for a solo P1, per the decided design). Each
  player card shows a small `SHIP_HULL`-based ship icon in that player's
  color; P1/P2 have a `[change]` toggle between keyboard and gamepad
  (default keyboard), P3/P4 are gamepad-only with no toggle shown.
  Real Gamepad-API connection detection (`this.input.gamepad.getAll()`,
  polled every `update()`) drives each card's READY/WAITING status via a
  new pure function, `computeGamepadReadiness` (`systems/
  GamepadAssignment.ts`, tested in `tests/gamepadAssignment.test.ts`) —
  claims connected controllers in P1→P2→P3→P4 order among only the
  slots currently set to gamepad, per `docs/controls.md`.
- **`main.ts`**: registers both new scenes and turns on
  `input: { gamepad: true }` (off by default in Phaser) so the menu's
  connection detection actually receives events.
- **Music**: `menu.mp3` now starts in `SplashScene` and carries through
  `MenuScene` unchanged (`playLoopingMusic`'s `isPlaying` guard prevents
  a restart on the scene switch); `GameScene.create()` now calls
  `stopMusic(this, MENU_MUSIC_KEY)` before starting the gameplay track.
- New `src/utilities/Color.ts` (`toCssHex`) converts the numeric hex
  colors in `GameConfig.COLORS` to CSS hex strings for Phaser text/stroke
  styling — several scenes needed this, worth the one shared helper.

**Deliberately not built in this slice**, to keep scope honest:

- The Twin-Planets/nebula/`earth.jpg` background from `docs/art_direction.md`
  — `MenuScene` uses a flat `COLORS.background` fill for now. That's
  roadmap item 12 (visual-polish pass), not this one.
- **The mode toggle and per-slot input source picked in `MenuScene` are
  cosmetic only.** `startGame()` just calls `this.scene.start('Game')`
  with no data — `GameScene` still always builds the same single
  P1-keyboard ship regardless of what was selected. Wiring the menu's
  choices into actual gameplay is roadmap items 7/8/10/11 (Cooperative/
  Competitive logic, P2 keyboard, real gamepad gameplay input), each a
  separate, larger piece of work than the menu screen itself.

### Verified

- `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (26/26 — 4 new
  tests for `computeGamepadReadiness`), `npm run build` all clean.
- Confirmed `dist/assets/splash-*.png` exists post-build (hashed,
  ~2.4 MB, as expected for a full splash image).
- Dev server smoke-checked via `curl`: `/`, `/src/main.ts`, `/menu.mp3`,
  and `/src/assets/splash.png` (dev-mode Vite resolution) all return
  `200`.

### Not done yet

- **Not seen/heard in an actual browser** — same standing caveat as
  every entry so far. In particular: the blinking-prompt timing, whether
  "cover fit" crops splash.png acceptably at 960×600, whether the
  player-card layout reads well, and whether real hardware gamepads are
  actually detected by `this.input.gamepad` the way the code assumes —
  none of this has been seen running, only reasoned about and
  structurally verified.
- No `Esc`-to-go-back from Menu to Splash, no pause menu — out of scope
  for this ask.
- See "Deliberately not built" above for the two known gaps in menu
  fidelity/wiring.

---

## 2026-08-22 — Background music wired in (gameplay track playing, menu track staged)

### What was built

Un-defers background music from `docs/roadmap.md`'s "Explicitly deferred
past v1" list (sound *effects* stay deferred). Ported Godspeed's audio
architecture exactly:

- `debris/music/` (sibling to `debris/game/`, same as
  `godspeed/music/`) holds `menu.mp3` and `neon-horizon.mp3` (user-
  provided tracks — menu music and in-game music respectively).
- `vite.config.ts`: `publicDir: '../music'` so both files are served
  as-is (dev) and copied into `dist/` (build) without an import.
- `src/systems/Music.ts`: track keys/URLs (`MENU_MUSIC_KEY`/`_URL`,
  `GAMEPLAY_MUSIC_KEY`/`_URL`).
- `src/audio/MusicController.ts`: `playLoopingMusic`/`stopMusic` helpers
  over Phaser's game-global sound manager — ported from Godspeed's
  identical file, trimmed to the two functions actually used so far
  (no `pauseMusic`/`resumeMusic` yet, nothing calls them).
- `BootScene.preload()` loads both tracks via `this.load.audio(...)`.
- `GameScene.create()` calls `playLoopingMusic(this, GAMEPLAY_MUSIC_KEY)`
  — the in-game track now loops during play.
- `menu.mp3` is loaded and keyed but **nothing plays it yet** — there's
  no menu scene to trigger it from (`docs/roadmap.md` item 9, still
  unbuilt). It'll get wired to that scene's `create()` when it exists.

Also added `src/vite-env.d.ts` (`/// <reference types="vite/client" />`)
— missing from the original scaffold, needed for `import.meta.env`
to type-check; Godspeed has the equivalent file and this was a gap in
otherwise mirroring its config.

### Verified

- `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (22/22, unchanged
  — no new pure logic to test here), `npm run build` all clean.
- Confirmed `dist/menu.mp3` and `dist/neon-horizon.mp3` exist after
  build (proves `publicDir` copying actually works, not just configured).
- Dev server smoke-checked via `curl`: both `/menu.mp3` and
  `/neon-horizon.mp3` return `200`.

### Not done yet

- **Not heard playing in an actual browser** — same standing caveat as
  the rest of this project so far, no browser tool in this environment.
  Browser autoplay policy may block the very first `play()` call until
  a user gesture; Phaser's sound manager auto-unlocks on the first
  keydown/pointerdown so this should self-resolve once a player touches
  a control, but that's untested, not verified.
- No fade in/out, no volume control wired up (matches Godspeed — it has
  neither either). The start-screen mockup's volume sliders are still
  inert/scaffolded only.
- `menu.mp3` doesn't play anywhere yet, pending the menu scene itself.

---

## 2026-08-22 — First playable slice: `debris/game/` scaffolded, P1 ship + asteroid field

### What was built

Project scaffolding for `debris/game/`, mirroring Godspeed's tooling
exactly: Vite + TypeScript + Phaser 3, ESLint flat config, Prettier,
Vitest (`package.json`, `tsconfig.json`, `eslint.config.js`,
`.prettierrc.json`, `vitest.config.ts` all byte-identical or adapted only
where necessary — dev port 5175, `base: '/debris/'` on build).

On top of that, a first playable slice proving out the physics and
collision architecture `docs/technical_design.md` decided ahead of time:

- **Matter.js integration** (`src/main.ts`): `physics.matter.gravity =
  {x:0,y:0}`, scenes `[BootScene, GameScene]`.
- **Ship** (`src/entities/Ship.ts`): Matter-body-driven, "realistic drift"
  per the technical-design decision — thrust is a real `applyForce`
  impulse, turning is direct/kinematic (`setRotation` from input, no
  torque), matching `docs/gameplay.md`'s "Turn... does not move it."
  Circular collision hitbox decoupled from the drawn Interceptor hull
  (`SHIP_HULL` in `GameConfig.ts`), same pattern as Godspeed's entities.
- **Asteroid** (`src/entities/Asteroid.ts`): procedural jagged polygon
  (`systems/AsteroidShape.ts`, pure/seedable), circular Matter body,
  per-tier speed/radius/score (`smaller-is-faster`, "Classic inverse-size"
  scoring), splits large→medium→small on hit via
  `systems/AsteroidSplit.ts` (randomized spread, `SPLIT_SPREAD_RAD =
  Math.PI/3`). No rock-on-rock collision — enforced structurally via the
  Matter collision mask in `systems/CollisionCategories.ts`, not a manual
  per-pair check.
- **Projectile** (`src/entities/Projectile.ts`): constant-velocity,
  `isSensor: true` (Matter still owns hit *detection*, no physics
  *response* needed — the "pragmatic mix" testing-boundary decision),
  expires after `PROJECTILE.lifetimeMs`.
- **Screen-wrap** (`systems/MovementSystem.ts`): ship, asteroids, and
  projectiles all wrap once fully offscreen.
- **Keyboard input** (`src/input/KeyboardInput.ts`): tracks raw
  `KeyboardEvent.code` strings rather than Phaser's `KeyCodes` enum —
  required because Phaser can't distinguish left/right Ctrl, which is
  what makes the P2 "Right Ctrl" binding in `docs/controls.md` actually
  implementable later, not just a documented risk. `P1_BINDINGS` is wired
  into `GameScene` now; `P2_BINDINGS` exists but isn't instantiated yet.
- **GameScene** (`src/scenes/GameScene.ts`): wires all of the above
  together — one P1 ship, a procedural asteroid field that respawns
  (growing) once cleared, shooting with a fire-rate/on-screen-shot cap,
  collision-driven splitting and scoring, shown live via a simple score
  readout.

This is a deliberate first slice, not an attempt at all of v1 — same
incremental pattern Godspeed was built in. See `docs/roadmap.md` for what
this does and doesn't cover yet.

### Verified

- `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (22/22 across
  `asteroidShape`, `asteroidSplit`, `movementSystem`, `combatSystem`),
  `npm run build` all clean.
- Dev server (`npx vite --port 5175`) smoke-checked via `curl`: `/` and
  `/src/main.ts` both return `200` and serve the expected HTML/module.

### Not done yet

- **Not seen running in an actual browser** — this environment has no
  browser tool, only structural/serving verification (tsc, tests, build,
  curl). Ship "feel" (thrust force, max speed, friction — all flagged
  `unverified starting point` in `GameConfig.ts`) has not been playtested
  and should be expected to need retuning.
- P2 keyboard, any gamepad input, UFO, Shield pickup, lives/respawn/game
  over, Cooperative/Competitive mode logic, the already-designed
  HyperOut-style start menu, the synthwave/CRT visual pass, and
  deployment wiring are all still unbuilt — see `docs/roadmap.md`.
