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

export const ENEMY = {
  radius: 14,
  speed: 110, // px/sec - slower than the player, so it's outrunnable
  count: 3,
  pathUpdateIntervalMs: 300,
} as const;

export const BOSS = {
  radius: 22,
  speed: 90, // px/sec - slower than a regular enemy; it's tankier, not faster
  maxHits: 5,
  attackCooldownMs: 1400,
} as const;

export const PICKUP = {
  radius: 10,
  count: 3, // one of each UpgradeType, see systems/UpgradeSystem.ts
} as const;

export const UPGRADE_EFFECTS = {
  speedMultiplier: 1.35,
  fireCooldownMultiplier: 0.6,
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
