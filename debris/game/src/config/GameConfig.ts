// 4x the original playtested area (960x600), scaled 2x on each axis - first
// real playtest feedback said the field felt cramped. Ship/asteroid sizes
// below are scaled down accordingly so they read as smaller relative to
// the bigger field, not just naturally smaller from more room around them.
export const ARENA_WIDTH = 1920;
export const ARENA_HEIGHT = 1200;

export const COLORS = {
  background: 0x05050a,
  players: [0x00e5ff, 0xff9d00, 0xff2fd6, 0x8aff4d] as const, // P1-P4
  playerFill: 0x0d0d16,
  asteroid: 0xc9c9d6,
  asteroidFill: 0x14141c,
  ufo: 0xe0463c,
  ufoFill: 0x1c0d0d,
  shield: 0x5dade2,
  flame: 0xffb46b,
  blackHole: 0x9b6bff, // Gravity Well's gravity field/accretion disk - "Accretion Disk," docs/art_direction.md. The event horizon/lethal core deliberately reuse `ufo` (red) instead of a color of their own - see that doc's note on why.
  fracture: 0xa8e6ff, // The Fracture boss's icy crystal shell - new, distinct from Player 1's cyan and from Asteroid's neutral grey. Its core/cracks deliberately reuse `ufo` red again, same "red is the dangerous part" convention as Black Hole's event horizon.
  fractureFill: 0x0d2430,
  // Phase 2 fragment role tints (core/tether color only - the shard shell stays `fracture`/`fractureFill` on all three, still visibly "one family"). Aggressive reuses `ufo` red (same core as Phase 1's own), gravity reuses `blackHole` violet (a deliberate cross-reference - this fragment's whole gimmick is a gravity pull, same hue as the game's actual gravity hazard), launcher gets a new gold since nothing else in the palette fit.
  fractureLauncher: 0xffd166,
  // The Cardinal's own idle/ambient identity - a colder, more saturated
  // aqua-teal than Player 1's cyan (`players[0]`, 0x00e5ff), "shift to a
  // distinct cyan-teal," decided, picked live against the visual mockup.
  // Its charging telegraph deliberately reuses `fractureLauncher` gold
  // (not a new color) and its firing/critical state reuses `ufo` red,
  // same "reuse an existing danger hue rather than invent another one"
  // convention every other boss/hazard in this palette already follows.
  cardinal: 0x00ffb8,
  cardinalFill: 0x111420,
  // Scrap pickup (FractureSwarmBit, shared by both bosses) - "muted
  // jade," decided after comparing gold/copper/jade candidates in a
  // live mockup. Deliberately its own hue, not reused from anywhere
  // else: desaturated and darker than both Player 4's acid green
  // (`players[3]`, 0x8aff4d) and The Cardinal's own teal (`cardinal`,
  // 0x00ffb8), so it can't be mistaken for either at a glance despite
  // sitting in the same green/teal region of the palette.
  scrap: 0x4fae82,
} as const;

/**
 * Ship physics. `docs/technical_design.md` decided "realistic drift" over
 * arcade-tight damping - `frictionAir: 0` means true Newtonian coasting,
 * not Matter's small default air drag: there's no air in space, so
 * nothing slows the ship down once thrust stops. Only `applyForce` while
 * actively thrusting changes velocity; turning never does.
 * Turning is direct/kinematic (set angle from input, no rotational physics)
 * per `docs/gameplay.md`: "Turn... rotates the ship in place. Does not
 * move it" - only thrust goes through the physics engine as an applied
 * force, matching the original's actual control model.
 *
 * All of thrustForce/maxSpeed/frictionAir are starting points, not
 * verified by feel - this environment has no way to actually playtest
 * physics tuning, only reason about it. Expect to retune once this is
 * running in a real browser.
 *
 * **Matter velocity unit gotcha, learned from a real bug**: `Body.update()`
 * does `position += velocity` once per physics tick (see
 * `node_modules/phaser/src/physics/matter-js/lib/body/Body.js`), and
 * `setVelocity(x, y)` assigns that vector directly - so a "speed" fed into
 * `setVelocity` is **pixels per tick**, not pixels per second, and at
 * Phaser's default 60 ticks/sec, real on-screen speed is roughly
 * `value * 60`. `maxSpeed` below was already correct (labelled "px/step");
 * `ASTEROID`/`UFO` speeds originally weren't (they were sized as if
 * px/sec and fed straight into `setVelocity`, making rocks ~60x too fast
 * on screen - that's the "rocks are way too fast" bug). Every speed
 * constant in this file that feeds `setVelocity` directly is now in
 * correct per-tick units - divide an intended on-screen px/sec by ~60 to
 * get the right value here.
 *
 * **`applyForce` gotcha, same family of bug**: Matter's Verlet integration
 * (`Body.update` again) does
 * `velocity += (force / mass) * deltaTimeSquared`, where `deltaTime` is in
 * **milliseconds** (~16.67 by default) - so `deltaTimeSquared` is ~277.8,
 * not ~1. A naive "small-looking" force is actually applied ~278x, and
 * `mass = density * area` means halving `radius` (as this rescale just
 * did, 16→8) quarters mass and quadruples acceleration for the same
 * force. `thrustForce` accounts for both of those now - it's tiny on
 * purpose, not a typo.
 */
export const SHIP = {
  radius: 8, // collision hitbox; visual hull is the decided Interceptor shape, rendered separately
  turnRateRadPerSec: Math.PI * 1.2, // ~216 deg/sec
  thrustForce: 0.00003, // see the applyForce gotcha above - reaches maxSpeed in ~2-3s of continuous thrust, not instantly
  maxSpeed: 6, // px/step velocity cap - see docs/gameplay.md's "small velocity cap keeps coasting recoverable"
  frictionAir: 0, // no air in space - the ship never decelerates on its own, only thrust changes velocity
  fireCooldownMs: 250, // "Classic Asteroids" pacing, decided in docs/gameplay.md
  maxOnScreenShots: 4,
  // Dead time between destruction and reappearing at the respawn point -
  // "explode, then reappear invulnerable" (decided), not an instant swap.
  // A starting guess, not playtested - no way to feel out "does this read
  // as a beat or a stall" in this environment.
  respawnDelayMs: 1000,
  respawnInvulnerabilityMs: 2000, // can move/turn immediately on respawn, but not fire - GameScene gates isFiring on this
} as const;

/** Ship hull, nose along local +x, decided in docs/art_direction.md ("Interceptor"). */
export const SHIP_HULL: readonly (readonly [number, number])[] = [
  [1.0, 0],
  [0.2, 0.28],
  [-0.85, 0.68],
  [-0.45, 0.22],
  [-0.3, 0],
  [-0.45, -0.22],
  [-0.85, -0.68],
  [0.2, -0.28],
];
export const SHIP_HULL_SCALE = 11; // px - normalized hull * this = on-screen size

export const PROJECTILE = {
  radius: 2.5,
  speed: 8, // px/step (Matter velocity units, not px/sec - see SHIP's doc comment above). ~480px/sec on screen.
  lifetimeMs: 1800, // doubled from 900 - shots travel/last twice as long, same max-4-on-screen cap (SHIP.maxOnScreenShots)
} as const;

/**
 * Weapon upgrade system, requested directly (implements a scoped-down
 * slice of docs/roadmap.md's unbuilt "Salvage" Weapons tree - just the
 * three upgrades below, not the full swap/stack-loadout system that
 * future idea leaves open). Every player starts on the plain base weapon
 * (`PROJECTILE` above); each upgrade is a one-time per-player unlock,
 * purchased with that player's own Scrap (`PlayerSlot.scrap`,
 * `systems/WeaponShop.ts`), and composes with the others rather than
 * replacing anything - see `systems/WeaponUpgrades.ts` for how a ship's
 * active upgrade set turns into the actual list of shots fired each
 * trigger-pull. Every number below is a starting guess, same standing
 * "not playtested" caveat as the rest of this file.
 */
export const WEAPON_UPGRADES = {
  /** Fires 3 pellets per trigger-pull instead of 1: one straight ahead,
   * one at +spreadRad, one at -spreadRad off the ship's current heading. */
  splitshot: {
    spreadRad: (12 * Math.PI) / 180, // 12 degrees each side, 24 degrees total - a starting guess
  },
  /** Multiplies SHIP.fireCooldownMs - "significantly reduces," decided
   * as roughly a third of the base cooldown. Composes with Heavy Shot
   * (fires heavy shots at the reduced cooldown) and with the heat system
   * below (still gated by it, doesn't bypass overheating). */
  rapidFire: {
    cooldownMultiplier: 0.35,
    /** "Optional but recommended," built and on by default - flip
     * `enabled` off to fall back to plain unlimited rapid fire without
     * touching any call site. Heat is added once per trigger-pull, not
     * per individual pellet - Splitshot firing 3 pellets at once is one
     * weapon discharge, not three, so equipping it doesn't silently
     * triple this system's heat cost. */
    heat: {
      enabled: true,
      heatPerShot: 12, // ~8-9 shots before overheating at maxHeat=100
      maxHeat: 100,
      decayPerSecond: 30, // drains a full bar in ~3.3s of not firing
      overheatLockoutMs: 1500, // "short cooldown," decided as a starting guess
    },
  },
  /** Overrides the base weapon's own projectile stats entirely while
   * active (bigger, slower, more damage, a real kinetic push) - composes
   * with Splitshot by feeding these numbers into every pellet instead of
   * the base ones, per the brief's own SPLITSHOT+HEAVY SHOT example. */
  heavyShot: {
    radius: 7, // ~2.8x PROJECTILE.radius (2.5) - reads as a distinctly bigger shot
    speed: 4, // half PROJECTILE.speed (8) - "moves slower," decided
    damage: 4, // vs. the implicit 1 every other hit deals - only matters against Fracture/Cardinal's HP (confirmed via AskUserQuestion: asteroids/UFO die in one hit regardless of damage, so this is a boss-shredding number, not an asteroid one)
    // px/step velocity added directly to whatever's pushed (see
    // GameScene.applyHeavyShotImpulse/systems/KineticImpulse.ts) - full
    // strength at the impact point, linearly falling off to zero at
    // impulseRadius. Comparable to BLACK_HOLE.captureBaseSpeed (1.5) so
    // it reads as a real shove, not a nudge - clearly faster than a
    // large asteroid's own base speed (ASTEROID.large.speed, 0.67).
    kineticImpulse: 1.5,
    impulseRadius: 90, // area-of-effect push radius, ~4x a large asteroid's own radius (23) - confirmed via AskUserQuestion ("area impulse too," not just the directly-hit asteroid's split children)
  },
  /** Every player's own Scrap cost to unlock each upgrade - flat per the
   * brief's "suggested initial costs," not scaled by anything (round
   * number, difficulty, or how many upgrades a player already owns). */
  costs: {
    splitshot: 5,
    rapidFire: 5,
    heavyShot: 5,
  },
} as const;

/**
 * Asteroid sizes and the "smaller is faster" curve, decided in
 * docs/gameplay.md: small ~1.8-2x large's speed. Scores are the "Classic
 * inverse-size" decision (large=20, medium=50, small=100). `speed` is in
 * Matter's px/step units (see SHIP's doc comment above) - roughly
 * 40/65/78 px/sec on screen, not the raw numbers below.
 */
export const ASTEROID = {
  large: { radius: 23, speed: 0.67, score: 20 },
  medium: { radius: 14, speed: 1.08, score: 50 },
  small: { radius: 8, speed: 1.3, score: 100 },
  /**
   * Silhouette variety (docs/roadmap.md's "more varied asteroid
   * silhouettes" polish-pass item) - one family is picked at random per
   * rock (`Asteroid.ts`, `systems/AsteroidShape.ts`'s `pickShapeFamily`)
   * instead of every rock sharing one fixed vertexCountRange/jaggedness
   * pair. Scoped via a live-rendered concept review + `AskUserQuestion`
   * before landing. `jagged` is the original v1 baseline (matches the
   * confirmed live sample in docs/art_direction.md), unchanged - the
   * other two are new.
   */
  shapeFamilies: [
    { vertexCountRange: [7, 9] as const, jaggedness: 0.2 }, // rounded
    { vertexCountRange: [8, 13] as const, jaggedness: 0.45 }, // jagged - v1 baseline, unchanged
    { vertexCountRange: [11, 15] as const, jaggedness: 0.75 }, // spiky
  ] as const,
  spawnCountPerWave: 5,
  waveGrowthPerLevel: 2, // each cleared wave spawns this many more large asteroids
  /**
   * Fixes a real bug, reported directly ("[a Gravity Well] accelerates
   * the asteroids... without destroying [them] they are too fast to
   * shoot"): a Black Hole's (or a Fracture gravity Fragment's) outer-band
   * pull is a continuous applied force with no speed ceiling of its own,
   * and asteroids have zero air friction, so a boosted rock stayed that
   * fast *permanently*, well past the hazard's own despawn. Confirmed via
   * `AskUserQuestion`: the pull itself staying dramatic wasn't the
   * complaint, only that it never wore off - so this decays any speed
   * above the rock's own tier `speed` (above) back down, but only once
   * it's no longer being pulled by anything at all
   * (`GameScene.applyBlackHoleGravityForces`/`applyFractureGravityForces`
   * track this per-frame; `Asteroid.update()` reads it) - a starting
   * guess (not playtested), same standing caveat as every other physics
   * constant in this file: ~4-5s for a rock pulled to roughly 3x normal
   * to fully settle back down.
   */
  speedDecayPerSec: 0.3,
} as const;

export const UFO = {
  radius: 24,
  speed: 0.92, // px/step (Matter velocity units, not px/sec - see SHIP's doc comment above). ~55px/sec on screen.
  score: 200, // decided: keep the original placeholder, per docs/gameplay.md's "200+ points"
  fireCooldownMs: 1800,
  spawnIntervalMs: 12000, // no cap on concurrent UFOs, decided - if nothing's killed the last one, a new one spawns anyway
  maxConcurrentDuringBoss: 4, // "boss stages spawn max 4 UFOs," decided - the one exception to the no-cap rule above, gated by GameScene.isBossEncounterActive()
  shotSpeed: 6, // px/step - slightly slower than the player's PROJECTILE.speed (8), stays dodgeable
  shotRadius: 2.5,
  shotLifetimeMs: 1500,
  // "Moderate spread," decided: perfect lead-the-target angle gets a
  // uniform-random error in [-aimSpreadRad, +aimSpreadRad] added to it
  // each shot - noticeably imperfect, dodgeable with movement, still a
  // real threat if you sit still.
  aimSpreadRad: Math.PI / 10, // ~18 degrees
} as const;

export const SHIELD = {
  radius: 14,
  speed: 0.4, // px/step (Matter velocity units, not px/sec - see SHIP's doc comment above). ~24px/sec on screen - slower than any asteroid, reads as calm/collectible.
  spawnIntervalMs: 25000, // "Moderate" cadence, decided in docs/gameplay.md
  // Stacks up to this many charges (was a single non-stacking charge) -
  // a pickup while already at max is just wasted, same "no-op" semantics
  // the old single-charge version had at 1.
  maxCharges: 2,
} as const;

export const LIVES_PER_PLAYER = 3;

/**
 * Screen shake + particle burst tuning for destruction (docs/art_direction.md,
 * roadmap item 12). Decided: bigger deaths shake harder - ship/UFO
 * destruction gets `majorShake`, an asteroid popping gets the lighter
 * `minorShake`, rather than one flat intensity for everything. Shake
 * `intensity` is Phaser's own fraction-of-viewport unit (`Camera.shake`),
 * not pixels. All starting points, not playtested - no way to feel out
 * "does this read as punchy or excessive" in this environment.
 */
export const EFFECTS = {
  // sizePx (particle radius) scales with the same "bigger death = bigger
  // burst" logic count/speedRange already follow - was a flat 2px for every
  // burst type, made configurable and enlarged on request.
  shipBurst: { count: 20, speedRange: [40, 140] as const, lifespanMs: 500, sizePx: 5 },
  asteroidBurst: { count: 10, speedRange: [20, 80] as const, lifespanMs: 400, sizePx: 4 },
  ufoBurst: { count: 24, speedRange: [50, 160] as const, lifespanMs: 550, sizePx: 6 },
  majorShake: { durationMs: 250, intensity: 0.012 }, // ship or UFO destroyed
  minorShake: { durationMs: 120, intensity: 0.004 }, // an asteroid destroyed
} as const;

/**
 * The floating "+<score>" number that appears where a shot lands,
 * decided on request - in the scoring player's own HUD color
 * (`COLORS.players[ownerIndex]`), same "cheap, reads well, doesn't get
 * in the way" spirit as `DestructionBurst`. Sized on request too:
 * reviewed via `entities/ScorePopup.ts`'s live concept comparison
 * against a real drawn small rock (`ASTEROID.small.radius`, 8px) at true
 * 1:1 pixel scale - "the size of the smallest rocks," confirmed - not an
 * eyeballed guess.
 */
export const SCORE_POPUP = {
  fontSizePx: 11,
  strokeWidthPx: 1.4,
  glowBlurPx: 6, // Phaser Text `setShadow`'s blur, standing in for the reviewed concept's canvas radial-gradient glow
  riseDistancePx: 22,
  driftRange: [5, 9] as const, // random left/right sideways drift magnitude, direction randomized per popup
  rotationRad: 0.1, // peak tilt mid-flight (eases to 0 at both start and end) - see the "Drift & Glow" concept
  lifespanMs: 650,
} as const;

/**
 * Cooperative-only "emergency exit" mechanic, decided on request: an
 * unshielded hit in Cooperative no longer costs a life and auto-respawns
 * - it ejects the pilot as a drifting Commander another player must
 * rescue. Lives (`LIVES_PER_PLAYER` above) genuinely stop mattering in
 * this mode - a player is only out for the round if their Commander goes
 * unrescued past `rescueWindowMs` or is destroyed by a hazard first
 * (decided: adrift is a real risk, not just a countdown). Competitive
 * and Single Player are unaffected - they keep the lives/respawn system
 * exactly as it was.
 */
export const COMMANDER = {
  radius: 9, // Matter sensor hitbox - smaller than SHIELD's 14, a person is a smaller target than a pickup
  visualScale: 13, // px - normalized astronaut path (docs/art_direction.md) * this = on-screen size
  driftSpeed: 0.25, // px/step (Matter velocity units, not px/sec - see SHIP's doc comment above) - slower than SHIELD.speed (0.4), a tumbling person over a purposeful pickup
  rescueWindowMs: 10000, // "10 second timer," decided
  towOffsetPx: 22, // trails behind the towing ship's heading while carried, not glued exactly on top of it
} as const;

/**
 * Cooperative-only drop-off point for a rescued Commander (see COMMANDER
 * above) - "3 times size than space ships," positioned at arena center.
 * Trigger zone only (decided): no Matter body at all, just a fixed
 * position/radius GameScene checks a carrying ship's distance against
 * every frame - ships and asteroids pass through it like everything
 * already passes through everything else in Cooperative.
 */
export const SPACE_STATION = {
  armLength: SHIP_HULL_SCALE * 3, // "Cross Dock," docs/art_direction.md - the visual scale reference for "3x ship size"
  dropOffRadius: SHIP_HULL_SCALE * 3 * 1.15, // slightly bigger than the visual silhouette - a forgiving trigger, not a pixel-precise dock
  // "Moves before the boss fight to a random corner, then moves back
  // after, make the move visible," decided - an eased glide, not a
  // teleport (SpaceStation.travelTo()). Same duration for the outbound
  // and return trip.
  relocateTravelMs: 2500,
} as const;

/**
 * Gravity Well hazard (docs/gameplay.md), mode-agnostic - a periodic,
 * fixed-position black hole. `eventHorizonRadius` and `lethalRadius` are
 * genuine point-of-no-return boundaries, and the *visual* rings in
 * `entities/BlackHole.ts` are drawn at exactly those values, not a
 * separate "looks about right" size - see docs/art_direction.md's note
 * on why that matters for fairness. `gravityRadius` isn't a hard
 * boundary at all (see below) so it isn't drawn 1:1 - `glowRadius` is
 * the visual-only stand-in for it, and is drawn at face value.
 *
 * - `gravityRadius` down to `eventHorizonRadius`: escapable - a real
 *   Matter force, strong enough to matter near the hole, weak enough to
 *   out-thrust anywhere outside `eventHorizonRadius`. Deliberately spans
 *   the whole arena ("should affect the whole screen, farther away =
 *   lesser effect," decided) with a continuous linear falloff, not a
 *   sharp local cutoff - there's no real "edge" to this zone to draw a
 *   boundary at, which is why the visual glow uses its own, much
 *   smaller `glowRadius` instead.
 * - `eventHorizonRadius` down to `lethalRadius`: captured - "once in the
 *   event horizon you cannot get out," decided - velocity is overridden
 *   directly (not just forced) every frame from this point on, ignoring
 *   thrust entirely, accelerating as it nears center.
 * - Inside `lethalRadius`: destroyed (a ship's Shield still saves it -
 *   see the eject-back-out behavior in docs/gameplay.md).
 *
 * All tuning below is a starting guess, not playtested - same standing
 * caveat as every other physics constant in this file.
 */
export const BLACK_HOLE = {
  // "Should affect the whole screen, the farther away the lesser the
  // effect," decided - not a tight local hazard. Set past the arena's own
  // diagonal (~2265px for 1920x1200), so `computeGravityForce`'s linear
  // falloff never hard-cuts to zero anywhere in the playable field -
  // every point on screen feels *some* pull, tapering off gradually
  // toward the far corners rather than sharply at a nearby radius.
  gravityRadius: 2300,
  // Visual-only, deliberately *not* the same as `gravityRadius` above: the
  // pull's falloff no longer has a real edge to draw a boundary at (it
  // fades continuously all the way across the arena), so painting the
  // glow out to 2300px would just tint the whole screen instead of
  // reading as a hazard. This stays a compact halo near the hole itself -
  // `entities/BlackHole.ts` is the only thing that reads it.
  glowRadius: 260,
  eventHorizonRadius: 70,
  lethalRadius: 14,
  // px/step^2-ish Matter force unit (see the applyForce gotcha above) -
  // roughly 2/3 of SHIP.thrustForce right at the event horizon boundary,
  // so sustained thrust can still win against it there. Unchanged even
  // though `gravityRadius` grew a lot - "weak enough to out-thrust" is a
  // near-field property of the linear falloff, not tied to how far out
  // the (much weaker, at range) pull reaches.
  pullForceMax: 0.00002,
  captureBaseSpeed: 1.5, // px/step, the instant something crosses the event horizon
  captureAccelerationPerPx: 0.05, // additional px/step per px closer to center - accelerating infall
  // "Stay for 15 seconds, then disappear, then pause 60 sec before
  // spawning again," decided - two distinct durations. (Previously a
  // single `spawnIntervalMs` measured from scene start, never reset on
  // despawn - a bug that made it effectively respawn instantly every
  // time, with no real pause at all. See GameScene's timer fix.)
  activeDurationMs: 15000, // was 30000 - "black holes will stay for 15 seconds," decided
  pauseDurationMs: 60000,
  // "Not before 2 min into any stage - gives players time to clear the
  // rocks first," decided - a floor on top of `pauseDurationMs` above,
  // not a replacement for it (GameScene.update() takes whichever of the
  // two is more restrictive). Measured against `stageElapsedMs`, which
  // already resets to 0 at every stage transition.
  minStageElapsedMs: 120000,
  // "5 seconds before black hole appears, play black-hole-approaching.mp3,"
  // decided - GameScene plays this once the *later* of the two gates
  // above is within this many ms of clearing.
  approachWarningMs: 5000,
  minDistanceFromStation: 320, // Cooperative only - keeps it clear of the Space Station's own footprint
  minDistanceFromShips: 300, // avoids spawning it directly on top of an active ship
  shieldEjectSpeed: 4, // px/step outward burst when a shielded ship survives the lethal center
  shieldEjectInvulnerabilityMs: 2000, // same idea as SHIP.respawnInvulnerabilityMs - a beat to get clear before it can recapture you
} as const;

/**
 * The Fracture boss (docs/roadmap.md's "Enemy roster" future-ideas
 * section), built in three passes - see docs/roadmap.md item 19 for the
 * exact split. This pass adds real attacks (a laser for the Core, a
 * role-specific attack per Fragment), ship contact ("behave like rocks,"
 * kills unless shielded, same `pendingShipHits` path an asteroid ram
 * already uses), and turns Swarm from a shootable hazard into a safe
 * touch-to-collect scrap pickup - decided via `AskUserQuestion`, along
 * with the 10-second collection countdown once the last Fragment dies.
 *
 * Debris's first multi-hit enemy - every other enemy (asteroids, UFO)
 * dies in one shot. Every numeric value below is a pure starting guess,
 * same standing caveat as every other untested constant in this file.
 *
 * Three tiers, each splitting into the next on death:
 * - **Core** (Phase 1): one hitbox. Spawns off-screen above top-center
 *   and drifts down to the arena's center, then stops - "decided," a
 *   later, more specific instruction than the original "top-middle"
 *   pitch. Once stopped, fires a long laser beam in a random direction
 *   every `laserCooldownMs`, one at a time.
 * - **Fragment** (Phase 2): 3 of them on the Core's death, one per role,
 *   each with a real attack now (not just a cosmetic flourish):
 *   - 🔴 aggressive - a pulsing ring out to `ringMaxRadiusMultiplier` x
 *     its own radius, every `ringCooldownMs`.
 *   - 🔵 gravity - a Black-Hole-style pull (reuses
 *     `systems/BlackHoleGravity.ts` directly) out to
 *     `gravityPullRadiusMultiplier` x its own radius, continuously.
 *   - 🟡 launcher - fires a gold shard at a random living ship every
 *     `shardCooldownMs`.
 *   They actually move too, unlike the stationary Core - decided.
 * - **Swarm** (Phase 3): `swarmCountPerFragment` spawn per Fragment's
 *   death. Always safe to touch - decided - a pickup, not a hazard:
 *   collecting one adds 1 to that player's scrap count. Once the last
 *   Fragment dies, a `scrapCollectionMs` countdown starts (shown on
 *   screen); whatever's still uncollected when it runs out is gone.
 *
 * **Ship contact** ("behave like rocks," decided): the Core and every
 * Fragment kill an unshielded ship on touch, exactly like ramming an
 * asteroid (`Ship`'s own hazard-contact path, Shield absorbs it) - the
 * Fracture side takes no damage from this, same as an asteroid doesn't
 * from ramming a ship either. Swarm pickups are the deliberate
 * exception - never lethal. Scoped to ships only, not asteroids -
 * asteroids still pass through every Fracture tier untouched.
 */
export const FRACTURE = {
  radius: 85, // Matter hitbox - covers the Core's full visual footprint (tether length + shard size)
  maxHits: 20,
  score: 1000, // flat, the single biggest single payout in the game - defeating the Core specifically
  spawnAsteroidCount: 4, // "together with 4 big rocks," decided - spawned via the existing spawnWave(), not a new asteroid-spawn path
  announcementDurationMs: 3000, // "a big announcement... 3 seconds," decided - the game's first non-interactive, timed overlay (every other one waits for a keypress)
  materializeDurationMs: 900, // fade/scale-in beat once each tier appears, before it's actually hittable/collectible - applies to every tier

  driftSpeedPxPerStep: 0.6, // Core's descent from off-screen to arena-center - Matter velocity units, not px/sec
  laserCooldownMs: 2000, // "every 2 seconds," decided
  laserTelegraphMs: 400, // dim warning line before it's actually lethal - fairness, same spirit as every other hazard's telegraph in this game
  laserActiveMs: 300,
  laserFadeMs: 200,
  laserLength: 1400, // "long," decided - comfortably crosses most of the 1920x1200 arena from a central origin
  laserWidth: 14, // hit-test thickness, not a Matter body - see entities/FractureLaser.ts

  fragmentRadius: 45, // smaller than the Core's 85 - a real hitbox reduction to sell "this piece is not the whole boss anymore"
  fragmentMaxHits: 10,
  fragmentScore: 300,
  fragmentSpeed: 0.4, // px/step (Matter velocity units, not px/sec - see SHIP's own doc comment in this file) - moves, unlike the stationary Core

  ringMaxRadiusMultiplier: 3, // "3x the size of itself," decided
  ringCooldownMs: 5000, // "every 5 seconds," decided
  ringTelegraphMs: 300,
  ringExpandMs: 500,
  ringFadeMs: 200,

  gravityPullRadiusMultiplier: 3, // "3x the size of itself," decided
  gravityPullForceMax: 0.000012, // "a SMALL black hole" - weaker than BLACK_HOLE.pullForceMax (0.00002), same escapable-force math via computeGravityForce

  shardCooldownMs: 3000, // "every 3 seconds," decided
  shardSpeed: 5, // px/step - between UFO.shotSpeed (6) and PROJECTILE.speed (8), reads as a heavier "shard" than a clean laser bolt

  // Reported too small at 7 (14px across) - bumped to 11 (22px hitbox
  // diameter) after a live size comparison against ASTEROID.small's own
  // 16px-across footprint, this time deliberately bigger than the smallest
  // rock rather than under it (reverses the original "smaller than or the
  // same size" decision - was 12/24px pre-redesign, then 7/14px, now this).
  swarmRadius: 11,
  swarmSpeed: 0.9, // faster than fragmentSpeed - "smaller is faster," same as ASTEROID's own size tiers
  swarmCountPerFragment: 6, // 3 fragments x 6 = up to 18 total, reads as "dozens" across the whole Phase 3 escalation without ever having that many alive from one single fragment
  scrapCollectionMs: 10000, // "a 10 sec countdown," decided - starts once the last Fragment dies
} as const;

/**
 * Debris's second boss (docs/roadmap.md's "The Cardinal") - a permanent
 * four-armed fixture at exact arena-center, never drifts or moves like
 * The Fracture does. Every number below not explicitly called out as
 * "decided" in the brief is a proposed starting point, same "not a final
 * decision" caveat the design spec itself carries - picked to feel
 * roughly in scale with `FRACTURE` above, not derived from anything more
 * rigorous than that.
 *
 * Deliberately **not Matter-backed at all**, unlike The Fracture (which
 * "behaves like rocks" via a real Matter body/collision mask): a single
 * rigid body with four independently-destructible, continuously-rotating
 * hit zones doesn't fit Matter's category/mask model any more cleanly
 * than a laser beam does - same "plain math hazard" reasoning
 * `systems/BeamGeometry.ts` and `BlackHole`'s own gravity/lethal checks
 * already established for exactly this situation. `entities/Cardinal.ts`
 * owns a plain `Graphics` visual (no Matter body); GameScene hit-tests
 * ships/projectiles against it every frame via distance/segment math,
 * the same way it already does for the Black Hole and The Fracture's own
 * laser. The one exception is the Phase 2 plasma ball
 * (`entities/CardinalPlasmaBall.ts`), which is a normal small traveling
 * projectile and *is* Matter-backed, same shape as `FractureShard`.
 */
export const CARDINAL = {
  armCount: 4,
  armHp: 20, // "20 Hitpoint each arm," decided - tracked independently per arm, not a shared pool
  coreHp: 20, // "the core has 20 hitpoints," decided
  coreRadius: 75, // ram hazard throughout every phase; also the Phase 2/3 hittable radius once arms are gone
  armReach: 300, // distance from center to the cannon tip
  armInnerRadius: 60, // the arm's hit-zone starts just past the core, not from dead-center - keeps arm hits and core hits from overlapping
  armHitWidth: 56, // hit-test thickness for the outer/cannon end of an arm - not a Matter body, see the doc comment above
  spawnAsteroidCount: 3, // together with a few rocks, same "combined with ambient chaos" spirit as FRACTURE.spawnAsteroidCount (4) - fewer, since the rotating laser cross already fills the arena with danger on its own
  materializeDurationMs: 900, // matches FRACTURE's own fade/scale-in beat - same "materialize," decided convention, applied here too
  announcementDurationMs: 3000, // matches FRACTURE's "a big announcement... 3 seconds" - the same shared showBossAnnouncement() treatment

  rotationPeriodMs: 20000, // "somewhere in the 15-25 second range," proposed in the design spec - picked 20s
  laserCooldownMs: 3000, // "every 3 seconds," decided
  laserTelegraphMs: 700, // longer than FRACTURE's 400ms single-beam telegraph - four simultaneous lines need more warning to track
  laserActiveMs: 1000, // "exactly 1 second," decided - non-negotiable per the brief
  laserFadeMs: 200, // matches FRACTURE.laserFadeMs
  laserLength: 1500, // comfortably crosses the 1920px-wide arena from a central origin - a bit longer than FRACTURE.laserLength (1400) since all four sweep the whole arena, not just one direction
  laserWidth: 14, // matches FRACTURE.laserWidth - hit-test thickness, not a Matter body

  plasmaCooldownMs: 2000, // "every 2 seconds," decided
  plasmaSpeed: 5, // px/step (Matter velocity units) - between FRACTURE.shardSpeed (5) and UFO.shotSpeed (6)
  plasmaRadius: 8,
  plasmaLifetimeMs: 4000,

  detonationCountdownMs: 5000, // "a 5 sec timer," decided
  detonationMaxRadius: 480, // "roughly as far as the arms/lasers used to reach," proposed - matches the visual mockup's own blast-ring radius

  armScore: 150, // per arm destroyed
  coreScore: 1200, // the final blow that ends the fight - biggest single payout after FRACTURE.score (1000), since this is the later/harder of the two bosses
} as const;

/**
 * Shared "a boss stage just started" safety net, requested directly, for
 * both bosses (The Fracture, The Cardinal) in every mode. The very first
 * spawn point when a boss stage begins previously used the same normal
 * home diamond every non-boss stage transition does - a real gap, since
 * mid-fight *respawns* already get the safer `BOSS_CORNER_POSITIONS`
 * treatment (`GameScene.spawnOffsetFor`) but the opening spawn didn't,
 * because `resetStageHazards()` (which does the teleport) runs before
 * the boss entity itself exists, so `isBossEncounterActive()` was still
 * false at that exact moment. Fixed by passing an explicit
 * `isBossStageStart` flag into `resetStageHazards()` instead of relying
 * on that timing - see its own doc comment.
 */
export const BOSS_STAGE_START = {
  invulnerabilityMs: 3000, // "3 seconds unbreakable," decided - longer than SHIP.respawnInvulnerabilityMs (2000ms), since a boss fight's opening moment is a higher-stakes spot to appear vulnerable in than an ordinary mid-round respawn
} as const;
