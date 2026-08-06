export const ARENA_WIDTH = 960;
export const ARENA_HEIGHT = 640;

export const COLORS = {
  background: 0x05050a,
  wall: 0x2a2a35,
  player: 0x3fd0ff,
  projectile: 0xf2c94c,
  danger: 0xe0463c,
  // pickupSpeed/pickupRapidFire/pickupExtraLife retired - Pickup.ts renders
  // real sprite art now (see PowerupFrames.ts), each with its own baked-in
  // color, not a flat tint. pickupShield stays: HUD.ts's hand-drawn shield
  // icon still uses it.
  pickupShield: 0x5dade2,
  bulwarkRing: 0x9b59b6,
  skirmisherRing: 0x2ecc71, // green - not in docs/art_direction.md's documented palette, added on request to give Skirmisher its own ring color distinct from Bulwark's violet
  skirmisherBeam: 0x9b59b6, // same violet as bulwarkRing - reuses the palette's "notable enemy attack" hue
  healthBarBackground: 0x14141c,
  healthBarFill: 0xf2c94c, // same gold as the player's shots/projectile - reads as "vitality," not danger
} as const;

export const ENEMY_HEALTH_BAR = {
  height: 4,
  offsetY: 6, // px below the enemy's edge (radius) before the bar starts
  backgroundAlpha: 0.85,
  // Rendered as separate GameObjects at a higher depth than the enemy's own
  // sprite, not baked into it - stays visible/correct if the primitive
  // circles are ever swapped for real sprite art (see docs/art_direction.md).
  depth: 10,
} as const;

export const PLAYER = {
  radius: 14,
  speed: 220, // px/sec
  lives: 3,
  invulnerabilityMs: 1200, // grace period after being hit, before another hit can count
  // Velocity ramps toward the target instead of snapping instantly - ~0.1s
  // to reach full speed from a standstill (220/2200), subtle enough to stay
  // arcade-snappy rather than floaty. See systems/MovementSystem.ts.
  accelerationPxPerSec2: 2200,
} as const;

export const WARDEN_SPRITE = {
  // Idle's reference frame is 104x130px; this scales it to ~35x44px on
  // screen - noticeably bigger than PLAYER.radius's 28px hitbox diameter,
  // which is normal for a top-down character sprite (hood/cloak/weapon
  // extend past the actual collision circle).
  scale: 0.34,
} as const;

export const POWERUP_SPRITE = {
  // Normal (non-flash) frames run roughly 90-140px wide in the source
  // sheet; this scales a ~120px frame to ~26px on screen, a bit bigger
  // than the old flat PICKUP.radius=10 circle (20px diameter) - reads
  // clearly without dominating a 40px maze tile. Each animation's last
  // frame is a wider "flash" pose (up to 224px for Speed) that reads
  // noticeably bigger for that one frame - part of the source art, not
  // compensated for here.
  scale: 0.22,
} as const;

export const BOSS_SPRITE = {
  // idle/walk frames run ~200-230px wide/tall in the source sheet; this
  // scales a ~210px frame to ~63px on screen - about 1.4x BOSS.radius's
  // 44px hitbox diameter, matching the same "sprite bigger than hitbox"
  // ratio WARDEN_SPRITE uses, and clearly the largest entity on screen.
  scale: 0.3,
} as const;

export const PROJECTILE = {
  radius: 4,
  speed: 520, // px/sec
  fireCooldownMs: 220,
  lifetimeMs: 1200,
} as const;

export const MAZE = {
  cols: 11,
  rows: 7,
  tileSize: 40, // px, spacing between cell centers (unaffected by wallThickness)
  wallThickness: 10, // px, thin bars/posts instead of solid tileSize blocks
  braidChance: 0.6, // fraction of extra (non-tree) walls knocked down to add loops/open rooms
} as const;

// Baseline chaser, named "Drone" in docs/enemy_design.md. Kept as ENEMY
// (not DRONE) since this constant predates the multi-type roster and is
// still the default Enemy() falls back to when no stat override is given.
export const ENEMY = {
  radius: 14,
  speed: 110, // px/sec - slower than the player, so it's outrunnable
  count: 3,
  pathUpdateIntervalMs: 300,
  maxHits: 4,
  // Brief speed-up ("lunge") when it has a clear straight corridor to the
  // player at least lungeMinCells away - see ai/Pathfinding.ts's
  // hasClearCorridor, driven from GameScene on the shared repath tick.
  lungeSpeedMultiplier: 1.6,
  lungeMinCells: 2,
} as const;

export const SENTINEL = {
  radius: 14,
  speed: 110, // same pace as a Drone once awake - the threat is the ambush, not raw speed
  triggerDistance: 130, // px; wakes once the player is this close
  maxHits: 4,
  // Re-arms (goes back dormant) once the player has been past this
  // distance for this long - an ambush that resets instead of a one-time
  // trap. Distance is deliberately > triggerDistance so it doesn't
  // immediately re-wake the moment it goes dormant.
  rearmDistance: 260,
  rearmDelayMs: 3000,
} as const;

export const SEEKER = {
  radius: 10, // smaller than a Drone - reads as quick/light
  speed: 165, // ~1.5x Drone
  maxHits: 4,
  // Retargets on its own tighter cadence than the shared ENEMY.
  // pathUpdateIntervalMs (300ms) - reacts to the player's direction changes
  // noticeably faster, reads as twitchy/relentless rather than just fast.
  pathUpdateIntervalMs: 100,
} as const;

export const BULWARK = {
  radius: 18,
  speed: 70, // slower than a Drone - the threat is durability, not pace
  maxHits: 5,
  // "Charge": speeds up when it has a clear straight corridor to the player
  // at least chargeMinCells away - same hasClearCorridor check as the
  // Drone's lunge, just a bigger multiplier and a longer required runway.
  chargeSpeedMultiplier: 1.8,
  chargeMinCells: 3,
} as const;

export const SKIRMISHER = {
  radius: 12,
  speed: 120,
  fleeDistance: 90, // px; below this range it backs off instead of closing in
  // Hysteresis fix: won't resume chasing until past reengageDistance, not
  // just past fleeDistance again - prevents flickering direction for a
  // player parked right at the boundary (see docs/enemy_design.md).
  reengageDistance: 130,
  maxHits: 4,
  // Fires a fast "sniper" shot at the player while retreating, if it has a
  // clear line of sight (hasClearCorridor) - the actual "hit" in
  // "hit and run." Faster than a normal projectile so it reads as a laser.
  sniperCooldownMs: 1600,
  sniperSpeed: 900,
} as const;

export const BOSS = {
  radius: 22,
  speed: 90, // px/sec - slower than a regular enemy; it's tankier, not faster
  maxHits: 20,
  attackCooldownMs: 1400,
  // Past this fraction of max HP remaining, the boss enters phase two:
  // attacks faster (cooldown multiplied, composes with FloorDifficulty's
  // own per-floor cooldown scaling) and fires a spread instead of one
  // aimed shot, so the fight visibly escalates instead of staying flat.
  phaseTwoHpFraction: 0.5,
  phaseTwoCooldownMultiplier: 0.6,
  phaseTwoShotCount: 3,
  phaseTwoSpreadDegrees: 18,
} as const;

export const FLOOR_DIFFICULTY = {
  // Applied per floor beyond the first (floor 1 = no scaling). Kept small
  // and linear on purpose - the roster composition (see
  // systems/FloorRoster.ts) is what mainly drives difficulty; these are a
  // secondary nudge, not the primary lever.
  enemySpeedStepPercent: 0.08,
  bossHitsStepPerFloor: 1,
  bossAttackCooldownStepMs: 100,
  bossAttackCooldownFloorMs: 700, // never faster than this, regardless of floor
} as const;

export const PICKUP = {
  radius: 10,
  count: 4, // one of each UpgradeType, see systems/UpgradeSystem.ts
} as const;

export const UPGRADE_EFFECTS = {
  // Speed/Rapid Fire pickups are guaranteed one per floor (see
  // systems/FloorPickups.ts), so an uncapped multiplicative stack
  // compounds every floor regardless of skill - by floor 5 that was 3.3x
  // speed and ~7.7x fire rate. speedMultiplierCap/fireCooldownMultiplierFloor
  // put a ceiling on both; per-pickup growth stays the same, it just stops
  // mattering once you hit the cap.
  speedMultiplierPerPickup: 1.35,
  speedMultiplierCap: 2, // never faster than 2x base move speed
  fireCooldownMultiplierPerPickup: 0.6,
  fireCooldownMultiplierFloor: 0.3, // never faster than ~3.3x base fire rate
  shieldChargesGranted: 1, // each pickup grants one block-the-next-hit charge, stacks
} as const;

export interface BiomeTheme {
  readonly name: string;
  readonly background: number;
  readonly wall: number;
}

/**
 * Only the environment (background/wall color) varies by biome - player,
 * enemy, projectile, and pickup colors stay constant across all three so
 * gameplay-critical color coding (e.g. "gold ring = boss") never shifts
 * with the environment. All three stay within the palette documented in
 * docs/art_direction.md (obsidian/gold/sapphire/violet).
 */
export const BIOMES: readonly BiomeTheme[] = [
  { name: 'Obsidian Depths', background: 0x05050a, wall: 0x2a2a35 },
  { name: 'Sapphire Vault', background: 0x040a14, wall: 0x1c3550 },
  { name: 'Violet Sanctum', background: 0x0a0614, wall: 0x35234a },
];
