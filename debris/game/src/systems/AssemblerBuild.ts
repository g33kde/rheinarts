/**
 * The Assembler's build state (docs/roadmap.md's "The Assembler") - a
 * boss that welds itself together out of the asteroid field *during* a
 * normal stage, rather than materializing whole the way The Fracture
 * and The Cardinal both do.
 *
 * Several open questions from the concept are resolved here, and the
 * choices are load-bearing enough to record:
 *
 * - **It consumes the stage's real asteroids**, not ones it spawns.
 *   That's what makes it interesting: clearing rocks quickly is *also*
 *   how you starve it, so good play at the ordinary game is the
 *   counter, and ignoring the rocks to shoot the boss feeds it.
 * - **Full denial is allowed.** Run it out of material - clear the
 *   field before it finishes - and it collapses without ever becoming
 *   a boss. The concept flagged this as a real fork ("a boss you can
 *   skip is a strange thing to build"), and denial won: an
 *   interruption mechanic you can't actually complete is decoration.
 *   Starving it pays no score at all, so denial is the *safe* line
 *   rather than the lucrative one - the reward is simply not having to
 *   fight it.
 * - **Shots knock plates back off** while it's still building, so there
 *   are two counters - starve it, or actively undo its progress - and
 *   a crew can split between them.
 *
 * Pure state transitions, no Phaser: same convention as
 * `FractureCombat.ts` and `CardinalCombat.ts`, which this deliberately
 * mirrors so all three bosses' rules read the same way.
 */
export type AssemblerPhase = 'assembling' | 'complete' | 'collapsed';

export interface AssemblerState {
  /** Plates welded on so far - each one is an absorbed asteroid. */
  readonly plates: number;
  /** Hit points once complete. Meaningless while assembling, when shots knock plates off instead. */
  readonly hp: number;
  readonly phase: AssemblerPhase;
}

export interface AssemblerConfig {
  /** Plates needed before it comes alive as a boss. */
  readonly platesToComplete: number;
  /** HP granted per plate on completion - a better-fed Assembler is a tougher fight. */
  readonly hpPerPlate: number;
}

export function initialAssemblerState(): AssemblerState {
  return { plates: 0, hp: 0, phase: 'assembling' };
}

/**
 * Absorbs one asteroid. Completing on the final plate is what turns it
 * from a growing hazard into an actual boss, and its HP is set from
 * however much it managed to eat - so a crew that let it gorge has a
 * meaningfully longer fight than one that starved it down to the wire.
 */
export function absorbAsteroid(state: AssemblerState, config: AssemblerConfig): AssemblerState {
  if (state.phase !== 'assembling') return state;
  const plates = state.plates + 1;
  if (plates < config.platesToComplete) return { ...state, plates };
  return { plates, hp: plates * config.hpPerPlate, phase: 'complete' };
}

/**
 * A player's shot. While assembling it knocks a plate back off (never
 * below zero) rather than doing damage; once complete it's ordinary
 * damage, and zero HP collapses it for good.
 *
 * `damage` defaults to 1 so Heavy Shot can pass more, exactly like
 * `FractureCombat.applyHit`/`CardinalCombat.applyHit` already do.
 */
export function applyAssemblerHit(state: AssemblerState, damage = 1): AssemblerState {
  if (state.phase === 'collapsed') return state;

  if (state.phase === 'assembling') {
    return { ...state, plates: Math.max(0, state.plates - damage) };
  }

  const hp = state.hp - damage;
  if (hp > 0) return { ...state, hp };
  return { ...state, hp: 0, phase: 'collapsed' };
}

/**
 * Called when the field runs dry. An Assembler still assembling has
 * nothing left to build with and falls apart; one that already
 * completed is a live boss and is entirely unaffected - at that point
 * the rocks stopped mattering to it.
 */
export function starveAssembler(state: AssemblerState): AssemblerState {
  if (state.phase !== 'assembling') return state;
  return { ...state, phase: 'collapsed' };
}

/** True once it's a real threat - the point where it stops eating rocks and starts hunting players. */
export function isAssemblerActive(state: AssemblerState): boolean {
  return state.phase === 'complete';
}

/** 0-1 build progress, for the on-screen gauge while it's still growing. */
export function assemblerProgress(state: AssemblerState, config: AssemblerConfig): number {
  if (config.platesToComplete <= 0) return 1;
  return Math.min(1, state.plates / config.platesToComplete);
}
