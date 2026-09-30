/**
 * The S/A/B/C letter shown when a stage is cleared (docs/roadmap.md's
 * "v2 candidates"). The stage-clear beat previously went straight to
 * the weapon shop with nothing said about *how* the stage went, so a
 * clean no-damage clear and a scrappy one that barely survived looked
 * identical. Devil May Cry / Metal Gear Rising convention.
 *
 * **Decided: cosmetic only** - no bonus Scrap, no bonus score, nothing
 * on the leaderboard. It's feedback, and deliberately isn't wired into
 * the shop economy: this is a brand-new untuned measure, and coupling
 * an untuned measure to a balanced economy is how you break the
 * economy.
 *
 * Pure and unit-tested, same convention as the rest of `systems/`.
 */
export type StageRankLetter = 'S' | 'A' | 'B' | 'C';

export interface StageStats {
  /** Individual projectiles fired this stage - a Splitshot volley counts as its own three, which is the fair way to score accuracy. */
  readonly shotsFired: number;
  /** Shots that actually scored something. */
  readonly shotsHit: number;
  /** Times any player was hit this stage, shield-absorbed or not. */
  readonly hitsTaken: number;
  /** Time spent in the stage, excluding pauses (GameScene tracks this already). */
  readonly elapsedMs: number;
}

export interface StageRankConfig {
  /** Clearing in this long scores full marks for speed; slower scales down from here. */
  readonly parTimeMs: number;
  /** Each hit taken costs this much of the cleanliness component. */
  readonly cleanlinessPenaltyPerHit: number;
  readonly accuracyWeight: number;
  readonly cleanlinessWeight: number;
  readonly speedWeight: number;
  /** Minimum overall score (0-1) for each letter; anything below `b` is a C. */
  readonly thresholds: { readonly s: number; readonly a: number; readonly b: number };
}

export interface StageRankResult {
  readonly letter: StageRankLetter;
  /** The blended 0-1 score behind the letter - exposed mainly so this is debuggable/tunable rather than a black box. */
  readonly score: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Blends three components into one 0-1 score, then buckets it.
 *
 * A stage where nothing was ever fired (possible - a boss stage someone
 * survives without shooting, or a stage cleared entirely by collisions)
 * scores neutral on accuracy rather than zero: punishing a player for
 * not firing would rank "didn't need to shoot" below "missed a lot",
 * which is backwards.
 */
export function computeStageRank(stats: StageStats, config: StageRankConfig): StageRankResult {
  const accuracy = stats.shotsFired > 0 ? clamp01(stats.shotsHit / stats.shotsFired) : 0.5;
  const cleanliness = clamp01(1 - stats.hitsTaken * config.cleanlinessPenaltyPerHit);
  const speed = stats.elapsedMs <= 0 ? 1 : clamp01(config.parTimeMs / stats.elapsedMs);

  const totalWeight = config.accuracyWeight + config.cleanlinessWeight + config.speedWeight;
  const score =
    totalWeight <= 0
      ? 0
      : (accuracy * config.accuracyWeight + cleanliness * config.cleanlinessWeight + speed * config.speedWeight) /
        totalWeight;

  return { letter: letterFor(score, config), score };
}

function letterFor(score: number, config: StageRankConfig): StageRankLetter {
  if (score >= config.thresholds.s) return 'S';
  if (score >= config.thresholds.a) return 'A';
  if (score >= config.thresholds.b) return 'B';
  return 'C';
}
