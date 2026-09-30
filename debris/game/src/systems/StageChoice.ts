/**
 * Light stage choice (docs/roadmap.md's "v2 candidates") - after each
 * stage the crew picks what comes next, instead of the game deciding
 * alone. **Decided: everyone votes and the majority wins**, ties broken
 * by the lowest player number.
 *
 * This deliberately **keeps the normal/boss alternation** (item 22) as
 * the backbone rather than replacing it: what's chosen is the *flavor*
 * of the stage that was coming anyway. Before a boss stage you pick
 * which boss; before a normal stage you pick how the field is stacked.
 * That's a real decision every single stage, without unpicking the
 * pacing structure the whole boss rotation is built on.
 *
 * It also stays inside `docs/vision.md`'s "not procedural/roguelite"
 * line: nothing here persists between sessions, and there's no branching
 * run structure - just one choice per stage transition.
 */
export type BossChoiceId = 'fracture' | 'cardinal';
export type FieldChoiceId = 'standard' | 'dense' | 'void';
export type StageChoiceId = BossChoiceId | FieldChoiceId;

export interface StageChoiceOption {
  readonly id: StageChoiceId;
  readonly label: string;
  /** The tradeoff, short enough for a shop panel row. */
  readonly blurb: string;
}

export const BOSS_CHOICES: readonly StageChoiceOption[] = [
  { id: 'fracture', label: 'THE FRACTURE', blurb: 'SPLITS AS IT DIES' },
  { id: 'cardinal', label: 'THE CARDINAL', blurb: 'ROTATING LASER CROSS' },
];

export const FIELD_CHOICES: readonly StageChoiceOption[] = [
  { id: 'standard', label: 'STANDARD', blurb: 'THE USUAL FIELD' },
  { id: 'dense', label: 'DENSE FIELD', blurb: 'MORE ROCKS - DOUBLE SCORE' },
  { id: 'void', label: 'THE VOID', blurb: 'FEWER ROCKS - MORE UFOS' },
];

/** What each field choice does to the stage it starts. Boss choices carry no modifiers - picking a boss *is* the whole effect. */
export interface FieldModifiers {
  readonly asteroidCountMultiplier: number;
  readonly ufoIntervalMultiplier: number;
  readonly asteroidScoreMultiplier: number;
}

export const FIELD_MODIFIERS: Record<FieldChoiceId, FieldModifiers> = {
  standard: { asteroidCountMultiplier: 1, ufoIntervalMultiplier: 1, asteroidScoreMultiplier: 1 },
  // Straight risk/reward: a visibly busier field that pays double.
  dense: { asteroidCountMultiplier: 1.5, ufoIntervalMultiplier: 1, asteroidScoreMultiplier: 2 },
  // Quieter on rocks, but the thing that actually hunts you shows up
  // twice as often - emptier is not the same as safer.
  void: { asteroidCountMultiplier: 0.6, ufoIntervalMultiplier: 0.5, asteroidScoreMultiplier: 1 },
};

export function isFieldChoice(id: StageChoiceId): id is FieldChoiceId {
  return id === 'standard' || id === 'dense' || id === 'void';
}

/**
 * Resolves the crew's votes into one choice.
 *
 * `votes` is indexed by player slot, with `undefined` for a player who
 * didn't vote (or isn't in the round) - those are simply not counted,
 * rather than defaulting to anything, so one abstaining player can't
 * drag the result. Ties go to whichever tied option the
 * lowest-numbered voter picked, which is arbitrary but *stable* and
 * explainable at the cabinet ("P1 breaks ties"), unlike a random pick.
 *
 * Falls back to the first offered option when nobody voted at all -
 * a stage always has to start as something.
 */
export function resolveStageVote(
  votes: readonly (StageChoiceId | undefined)[],
  options: readonly StageChoiceOption[],
): StageChoiceId {
  const fallback = options[0]!.id;
  const tally = new Map<StageChoiceId, number>();
  for (const vote of votes) {
    if (vote === undefined) continue;
    if (!options.some((option) => option.id === vote)) continue; // ignore a stale vote for an option not on offer
    tally.set(vote, (tally.get(vote) ?? 0) + 1);
  }
  if (tally.size === 0) return fallback;

  const highest = Math.max(...tally.values());
  const tied = [...tally.entries()].filter(([, count]) => count === highest).map(([id]) => id);
  if (tied.length === 1) return tied[0]!;

  // Tie: the lowest-numbered player who voted for any tied option decides.
  for (const vote of votes) {
    if (vote !== undefined && tied.includes(vote)) return vote;
  }
  return fallback;
}

/**
 * Cycles a shop panel's cursor across a row list that now mixes weapon
 * upgrades, stage-choice votes and the READY row.
 *
 * Deliberately generic over plain strings and living here rather than
 * in `WeaponUpgrades.ts`: that module's own `nextShopCursor` knows only
 * about upgrades, and teaching it about stage choices would couple the
 * weapon system to the stage system for no reason. The shop screen is
 * what composes the two, so the composite navigation belongs with the
 * newer half.
 */
export function nextShopRow<T extends string>(current: T, direction: -1 | 1, rows: readonly T[]): T {
  if (rows.length === 0) return current;
  const index = rows.indexOf(current);
  // An unknown current row (e.g. a vote row that's no longer offered)
  // lands on the first row rather than wrapping from -1 into the last.
  if (index === -1) return rows[0]!;
  return rows[(index + direction + rows.length) % rows.length]!;
}
