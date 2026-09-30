/**
 * The kill-chain score multiplier (docs/roadmap.md's "v2 candidates").
 * Three leaderboards already existed but scoring was flat - every rock
 * was worth the same whenever you shot it, so there was nothing to
 * *play* for beyond survival. A decaying chain makes sustained
 * aggression the thing that scores, which is the lesson Geometry Wars
 * and Luftrausers both build their whole score economy on.
 *
 * **Decided: the chain breaks on a timeout *and* on taking a hit.**
 * Timeout alone would make it a pace meter; adding the hit-reset gives
 * it actual stakes, so a big multiplier is something you're nervous
 * about losing rather than something you passively accumulate.
 *
 * Pure state transitions, no Phaser or GameScene coupling - same
 * convention as `WeaponHeat.ts` and `CombatSystem.ts` next door.
 */
export interface ComboState {
  /** Consecutive scoring kills inside the window. Zero means no active chain. */
  readonly chain: number;
  /** When the most recent kill landed - the window is measured from here. `undefined` means no chain is running. */
  readonly lastKillAtMs: number | undefined;
}

export interface ComboConfig {
  /** How long a chain survives without another kill before it lapses. */
  readonly windowMs: number;
  /** Kills needed to climb each multiplier step - 2 means x2 at 2 kills, x3 at 4, and so on. */
  readonly killsPerStep: number;
  /** Ceiling, so a long clean stage can't run away with the scoring. */
  readonly maxMultiplier: number;
}

export const INITIAL_COMBO_STATE: ComboState = { chain: 0, lastKillAtMs: undefined };

/** Whether the chain has lapsed as of `nowMs` - true also when no chain is running at all. */
export function isComboExpired(state: ComboState, nowMs: number, config: ComboConfig): boolean {
  if (state.lastKillAtMs === undefined) return true;
  return nowMs - state.lastKillAtMs >= config.windowMs;
}

/**
 * A scoring kill. Extends an existing chain, or starts a fresh one if
 * the previous chain had already lapsed - checked here rather than
 * relying on the caller having run `decayCombo` first, so a kill can
 * never accidentally extend a chain that should already be dead.
 */
export function registerKill(state: ComboState, nowMs: number, config: ComboConfig): ComboState {
  const chain = isComboExpired(state, nowMs, config) ? 1 : state.chain + 1;
  return { chain, lastKillAtMs: nowMs };
}

/** Per-frame lapse check - returns the reset state once the window has passed, otherwise the state unchanged. */
export function decayCombo(state: ComboState, nowMs: number, config: ComboConfig): ComboState {
  if (state.chain === 0) return state;
  return isComboExpired(state, nowMs, config) ? INITIAL_COMBO_STATE : state;
}

/** Taking a hit wipes the chain outright, decided - see this module's own doc comment for why. */
export function breakCombo(): ComboState {
  return INITIAL_COMBO_STATE;
}

/**
 * The multiplier this chain is currently worth. Always at least 1, so
 * callers can multiply unconditionally without special-casing "no
 * chain" - a score of `points * comboMultiplier(...)` is correct
 * whether or not anything is chained.
 */
export function comboMultiplier(state: ComboState, config: ComboConfig): number {
  if (state.chain <= 0) return 1;
  const step = Math.floor(state.chain / config.killsPerStep);
  return Math.min(config.maxMultiplier, 1 + step);
}
