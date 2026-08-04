export const ARENA_WIDTH = 960;
export const ARENA_HEIGHT = 640;

export const COLORS = {
  background: 0x05050a,
  wall: 0x2a2a35,
  player: 0x3fd0ff,
  projectile: 0xf2c94c,
  danger: 0xe0463c,
  pickupSpeed: 0x2de1c2,
  pickupRapidFire: 0xffb400,
  pickupExtraLife: 0x9b59b6,
  pickupShield: 0x5dade2,
  bulwarkRing: 0x9b59b6,
} as const;

export const PLAYER = {
  radius: 14,
  speed: 220, // px/sec
  lives: 3,
  invulnerabilityMs: 1200, // grace period after being hit, before another hit can count
} as const;

export const WARDEN_SPRITE = {
  // Idle's reference frame is 104x130px; this scales it to ~35x44px on
  // screen - noticeably bigger than PLAYER.radius's 28px hitbox diameter,
  // which is normal for a top-down character sprite (hood/cloak/weapon
  // extend past the actual collision circle).
  scale: 0.34,
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
} as const;

export const SENTINEL = {
  radius: 14,
  speed: 110, // same pace as a Drone once awake - the threat is the ambush, not raw speed
  triggerDistance: 130, // px; stays parked until the player is this close
} as const;

export const SEEKER = {
  radius: 10, // smaller than a Drone - reads as quick/light
  speed: 165, // ~1.5x Drone
} as const;

export const BULWARK = {
  radius: 18,
  speed: 70, // slower than a Drone - the threat is durability, not pace
  maxHits: 2,
} as const;

export const SKIRMISHER = {
  radius: 12,
  speed: 120,
  fleeDistance: 90, // px; below this range it backs off instead of closing in
} as const;

export const BOSS = {
  radius: 22,
  speed: 90, // px/sec - slower than a regular enemy; it's tankier, not faster
  maxHits: 5,
  attackCooldownMs: 1400,
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
