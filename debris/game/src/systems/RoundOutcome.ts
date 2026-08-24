export type GameMode = 'cooperative' | 'competitive' | 'singlePlayer';

/** Display labels - shared by MenuScene's mode toggle and GameScene's HUD mode indicator, so the two screens never drift ("singlePlayer".toUpperCase() alone would read "SINGLEPLAYER", no space). */
export const GAME_MODE_LABELS: Record<GameMode, string> = {
  cooperative: 'COOPERATIVE',
  competitive: 'COMPETITIVE',
  singlePlayer: 'SINGLE PLAYER',
};

export type RoundOutcome =
  | { status: 'continue' }
  | { status: 'win'; winnerIndex: number }
  | { status: 'draw' }
  | { status: 'loss' };

/**
 * Pure round-over rule per docs/gameplay.md's "Lives & game over" section:
 * Cooperative ends when every ship is gone (a shared loss - clearing a
 * wave and choosing to stop is a separate, non-defeat "win" path this
 * function doesn't model). Competitive ends the moment one ship remains
 * ("last ship standing wins"), or is a draw if the last hit(s) took out
 * the final two ships in the same instant. Single Player reuses
 * Cooperative's exact "loss at zero, otherwise continue" rule - it's
 * always exactly one ship, so "everyone's out of lives" and "the one
 * player is out of lives" are the same check; GameScene layers the
 * high-score persistence on top, this function doesn't need to know
 * about that.
 */
export function evaluateRoundOutcome(aliveFlags: readonly boolean[], mode: GameMode): RoundOutcome {
  const aliveCount = aliveFlags.filter(Boolean).length;

  if (mode === 'competitive') {
    if (aliveCount > 1) return { status: 'continue' };
    if (aliveCount === 1) return { status: 'win', winnerIndex: aliveFlags.indexOf(true) };
    return { status: 'draw' };
  }

  return aliveCount === 0 ? { status: 'loss' } : { status: 'continue' };
}
