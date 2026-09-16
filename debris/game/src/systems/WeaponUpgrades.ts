import type { Vector2 } from '../utilities/Vector2';

/**
 * The three purchasable weapon upgrades (docs/roadmap.md's "Weapons"
 * idea, scoped down and requested directly - see GameConfig.ts's
 * `WEAPON_UPGRADES` doc comment). Add a new id here (and a matching
 * branch in `computeShotSpecs`/`computeFireCooldownMs` below) to extend
 * the system - nothing else needs to change to support it.
 */
export type WeaponUpgradeId = 'splitshot' | 'rapidFire' | 'heavyShot';

export const ALL_WEAPON_UPGRADE_IDS: readonly WeaponUpgradeId[] = ['splitshot', 'rapidFire', 'heavyShot'];

/** Display labels, same "lives next to the id/type it labels" convention as `systems/RoundOutcome.ts`'s own `GAME_MODE_LABELS` - a label, not logic, but still domain data rather than UI code. */
export const WEAPON_UPGRADE_LABELS: Record<WeaponUpgradeId, string> = {
  splitshot: 'SPLITSHOT',
  rapidFire: 'RAPID FIRE',
  heavyShot: 'HEAVY SHOT',
};

/** Cursor position within one player's shop panel (`GameScene`'s weapon shop) - cycles through the 3 upgrades (in `ALL_WEAPON_UPGRADE_IDS` order) plus a trailing READY row. */
export type ShopCursor = WeaponUpgradeId | 'ready';

/** `turnDirection`, applied once per rising edge by the caller - wraps in both directions so a player can reach READY by cycling either way past the last upgrade. Pure/testable, same "extract the rule" convention as every other small state-transition function in this file. */
export function nextShopCursor(current: ShopCursor, direction: -1 | 1): ShopCursor {
  const order: ShopCursor[] = [...ALL_WEAPON_UPGRADE_IDS, 'ready'];
  const index = order.indexOf(current);
  return order[(index + direction + order.length) % order.length]!;
}

/** A player's own weapon upgrade unlocks - each id is either owned or not, no stacking multiples of the same upgrade. */
export interface WeaponUpgradeState {
  readonly active: ReadonlySet<WeaponUpgradeId>;
}

export function hasUpgrade(state: WeaponUpgradeState, id: WeaponUpgradeId): boolean {
  return state.active.has(id);
}

/** One projectile's worth of spawn parameters - what `GameScene.fireProjectile` feeds straight into `new Projectile(...)`. */
export interface ShotSpec {
  readonly headingRad: number;
  readonly radius: number;
  readonly speed: number;
  readonly damage: number;
  readonly kineticImpulse: number;
}

/** Plain-object mirror of the relevant slice of `GameConfig.ts`'s `WEAPON_UPGRADES` + the base weapon's own stats - kept as a caller-supplied argument (not imported directly) so this module stays a pure function of its inputs, unit-testable with plain literals, no GameConfig/Phaser coupling. */
export interface WeaponUpgradeConfig {
  readonly base: { readonly radius: number; readonly speed: number; readonly damage: number; readonly kineticImpulse: number };
  readonly splitshot: { readonly spreadRad: number };
  readonly rapidFire: { readonly cooldownMultiplier: number };
  readonly heavyShot: { readonly radius: number; readonly speed: number; readonly damage: number; readonly kineticImpulse: number };
}

/**
 * The composability core of the whole system: one trigger-pull's worth
 * of shots, given a ship heading and a player's active upgrade set.
 * Splitshot decides *how many* shots fire and at what headings; Heavy
 * Shot decides *what stats* each of those shots has (overriding the base
 * weapon's numbers entirely, not stacking on top of them) - the two are
 * independent axes, so every combination (base, Splitshot alone, Heavy
 * Shot alone, both together) falls out of this one function without any
 * per-combination branching. Rapid Fire doesn't appear here at all - it
 * only changes *how often* this function gets called
 * (`computeFireCooldownMs` below), never its output.
 */
export function computeShotSpecs(state: WeaponUpgradeState, shipHeadingRad: number, config: WeaponUpgradeConfig): ShotSpec[] {
  const stats = hasUpgrade(state, 'heavyShot') ? config.heavyShot : config.base;

  const headings = hasUpgrade(state, 'splitshot')
    ? [shipHeadingRad - config.splitshot.spreadRad, shipHeadingRad, shipHeadingRad + config.splitshot.spreadRad]
    : [shipHeadingRad];

  return headings.map((headingRad) => ({ headingRad, ...stats }));
}

/** Rapid Fire multiplies the base cooldown - "still respect the weapon cooldown system," decided: this shortens the window canFire() checks, it doesn't bypass it. */
export function computeFireCooldownMs(state: WeaponUpgradeState, baseCooldownMs: number, config: WeaponUpgradeConfig): number {
  return hasUpgrade(state, 'rapidFire') ? baseCooldownMs * config.rapidFire.cooldownMultiplier : baseCooldownMs;
}

/**
 * A player's personal on-screen-shot budget. Splitshot fires 3
 * projectiles per trigger-pull instead of 1, so its cap scales
 * proportionally (confirmed via `AskUserQuestion`) - otherwise the
 * shared v1 cap (sized for a single-shot weapon, before upgrades
 * existed) would silently throttle the upgrade at close range.
 */
export function computeMaxOnScreenShots(state: WeaponUpgradeState, baseMaxOnScreenShots: number): number {
  return hasUpgrade(state, 'splitshot') ? baseMaxOnScreenShots * 3 : baseMaxOnScreenShots;
}

/** Straight-line distance helper shared by the two impulse targets below - kept local rather than pulled from MovementSystem.ts, which is wrap/clamp logic, not this. */
function distance(a: Vector2, b: Vector2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Heavy Shot's kinetic push (docs from the brief: "push asteroids,
 * change direction, add momentum to debris... if supported by the
 * game") - pure vector math, no Matter dependency, so it's directly
 * testable and `GameScene.applyHeavyShotImpulse` just applies whatever
 * this returns to a Matter body's velocity. Falls off linearly from full
 * `strength` at the impact point to zero at `radius` - a soft area
 * effect, not a hard on/off blast, confirmed via `AskUserQuestion`
 * ("area impulse too," not just the asteroid directly destroyed).
 *
 * A target sitting essentially on top of the impact point (a freshly
 * split child, spawned exactly at its parent's death position) gets
 * pushed along the shot's own heading - "SHIP -> HEAVY SHOT -> ASTEROID
 * -> NEW DIRECTION," the brief's own example. Anything else caught in
 * the radius wasn't in the shot's direct path, so it gets pushed
 * radially outward from the impact point instead, reading as a
 * shockwave rather than everything flying the same way.
 */
export function computeImpulseVelocity(
  impactPosition: Vector2,
  targetPosition: Vector2,
  shotHeadingRad: number,
  strength: number,
  radius: number,
): Vector2 | null {
  const dist = distance(impactPosition, targetPosition);
  if (dist > radius) return null;

  const falloff = radius === 0 ? 1 : 1 - dist / radius;
  const pushAngle = dist < 1 ? shotHeadingRad : Math.atan2(targetPosition.y - impactPosition.y, targetPosition.x - impactPosition.x);
  return {
    x: Math.cos(pushAngle) * strength * falloff,
    y: Math.sin(pushAngle) * strength * falloff,
  };
}
