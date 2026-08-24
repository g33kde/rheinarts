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
  vertexCountRange: [8, 13] as const,
  jaggedness: 0.45, // matches the confirmed live sample in docs/art_direction.md
  spawnCountPerWave: 5,
  waveGrowthPerLevel: 2, // each cleared wave spawns this many more large asteroids
} as const;

export const UFO = {
  radius: 24,
  speed: 0.92, // px/step (Matter velocity units, not px/sec - see SHIP's doc comment above). ~55px/sec on screen.
  score: 200, // decided: keep the original placeholder, per docs/gameplay.md's "200+ points"
  fireCooldownMs: 1800,
  spawnIntervalMs: 12000, // no cap on concurrent UFOs, decided - if nothing's killed the last one, a new one spawns anyway
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
  shipBurst: { count: 20, speedRange: [40, 140] as const, lifespanMs: 500 },
  asteroidBurst: { count: 10, speedRange: [20, 80] as const, lifespanMs: 400 },
  ufoBurst: { count: 24, speedRange: [50, 160] as const, lifespanMs: 550 },
  majorShake: { durationMs: 250, intensity: 0.012 }, // ship or UFO destroyed
  minorShake: { durationMs: 120, intensity: 0.004 }, // an asteroid destroyed
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
} as const;
