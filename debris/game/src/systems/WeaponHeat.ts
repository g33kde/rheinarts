/**
 * Rapid Fire's optional heat/overheat system (docs from the brief:
 * "optional but recommended... easy to enable, disable or balance
 * through configuration"). Pure state-transition functions, same
 * "extract the rule, unit-test it, let the caller own the Phaser/timing
 * side" convention as `systems/CombatSystem.ts`'s `canFire` - no Phaser
 * or GameScene coupling here at all.
 *
 * Deliberately generic (not Rapid-Fire-specific in its own types) even
 * though it's only ever wired to that one upgrade today - a future
 * upgrade could reuse the same shape without this module needing to
 * change.
 */
export interface HeatState {
  readonly heat: number;
  /** `undefined` = not currently locked out. Kept separate from `heat` reaching `maxHeat` so the lockout has its own fixed duration rather than ending the instant heat decays back below the cap. */
  readonly overheatedUntilMs: number | undefined;
}

export interface HeatConfig {
  readonly enabled: boolean;
  readonly heatPerShot: number;
  readonly maxHeat: number;
  readonly decayPerSecond: number;
  readonly overheatLockoutMs: number;
}

export const INITIAL_HEAT_STATE: HeatState = { heat: 0, overheatedUntilMs: undefined };

export function isOverheated(state: HeatState, nowMs: number): boolean {
  return state.overheatedUntilMs !== undefined && nowMs < state.overheatedUntilMs;
}

/**
 * Called once per successful trigger-pull, not per individual
 * projectile - Splitshot's 3 pellets are one weapon discharge, not
 * three separate ones, so equipping it doesn't triple this system's
 * heat cost (see `WeaponUpgrades.ts`'s own doc comment on the same
 * decision). Flips into a timed overheat lockout the instant heat caps
 * out - "firing is disabled for a short configurable cooldown," decided.
 * A no-op passthrough while `config.enabled` is false, so disabling heat
 * entirely is one config flag, no call-site changes.
 */
export function applyShotHeat(state: HeatState, nowMs: number, config: HeatConfig): HeatState {
  if (!config.enabled) return state;
  const heat = Math.min(config.maxHeat, state.heat + config.heatPerShot);
  const overheatedUntilMs = heat >= config.maxHeat ? nowMs + config.overheatLockoutMs : state.overheatedUntilMs;
  return { heat, overheatedUntilMs };
}

/**
 * Called every frame regardless of whether the player is firing -
 * "slowly decreases while not firing." Decay keeps running underneath an
 * active lockout too (rather than freezing at `maxHeat` until the
 * lockout ends), so the weapon doesn't necessarily snap straight back to
 * "one shot from overheating again" the moment firing is allowed again.
 */
export function decayHeat(state: HeatState, deltaSeconds: number, config: HeatConfig): HeatState {
  if (!config.enabled) return state;
  const heat = Math.max(0, state.heat - config.decayPerSecond * deltaSeconds);
  return { heat, overheatedUntilMs: state.overheatedUntilMs };
}
