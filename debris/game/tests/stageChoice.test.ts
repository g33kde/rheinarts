import { describe, expect, it } from 'vitest';
import {
  BOSS_CHOICES,
  FIELD_CHOICES,
  FIELD_MODIFIERS,
  isFieldChoice,
  nextShopRow,
  resolveStageVote,
} from '../src/systems/StageChoice';

describe('resolveStageVote', () => {
  it('returns the option with the most votes', () => {
    expect(resolveStageVote(['dense', 'dense', 'standard'], FIELD_CHOICES)).toBe('dense');
  });

  it('ignores players who did not vote rather than defaulting them', () => {
    expect(resolveStageVote([undefined, 'void', undefined, undefined], FIELD_CHOICES)).toBe('void');
  });

  it('falls back to the first option when nobody voted', () => {
    expect(resolveStageVote([undefined, undefined], FIELD_CHOICES)).toBe('standard');
    expect(resolveStageVote([], BOSS_CHOICES)).toBe('fracture');
  });

  it('breaks a tie with the lowest-numbered voter', () => {
    // P1 wants dense, P2 wants void - one each, so P1 wins
    expect(resolveStageVote(['dense', 'void'], FIELD_CHOICES)).toBe('dense');
    expect(resolveStageVote(['void', 'dense'], FIELD_CHOICES)).toBe('void');
  });

  it('skips non-voting players when breaking a tie', () => {
    // P1 abstains; P2 and P3 tie, so P2 (the lowest who actually voted) decides
    expect(resolveStageVote([undefined, 'void', 'dense'], FIELD_CHOICES)).toBe('void');
  });

  it('ignores a vote for an option that is not on offer', () => {
    // a stale field vote carried into a boss choice must not win
    expect(resolveStageVote(['dense', 'cardinal'], BOSS_CHOICES)).toBe('cardinal');
  });

  it('handles a clean majority over a tie-capable spread', () => {
    expect(resolveStageVote(['void', 'dense', 'void', 'standard'], FIELD_CHOICES)).toBe('void');
  });
});

describe('isFieldChoice', () => {
  it('separates field choices from boss choices', () => {
    expect(isFieldChoice('dense')).toBe(true);
    expect(isFieldChoice('standard')).toBe(true);
    expect(isFieldChoice('cardinal')).toBe(false);
    expect(isFieldChoice('fracture')).toBe(false);
  });
});

describe('FIELD_MODIFIERS', () => {
  it('leaves a standard stage completely unmodified', () => {
    expect(FIELD_MODIFIERS.standard).toEqual({
      asteroidCountMultiplier: 1,
      ufoIntervalMultiplier: 1,
      asteroidScoreMultiplier: 1,
    });
  });

  it('makes the dense field a real risk/reward trade', () => {
    expect(FIELD_MODIFIERS.dense.asteroidCountMultiplier).toBeGreaterThan(1);
    expect(FIELD_MODIFIERS.dense.asteroidScoreMultiplier).toBeGreaterThan(1);
  });

  it('makes the void quieter on rocks but busier on UFOs', () => {
    expect(FIELD_MODIFIERS.void.asteroidCountMultiplier).toBeLessThan(1);
    // a lower interval means they arrive more often
    expect(FIELD_MODIFIERS.void.ufoIntervalMultiplier).toBeLessThan(1);
  });

  it('defines modifiers for every field choice offered', () => {
    for (const option of FIELD_CHOICES) {
      expect(FIELD_MODIFIERS[option.id as keyof typeof FIELD_MODIFIERS]).toBeDefined();
    }
  });
});

describe('nextShopRow', () => {
  const rows = ['splitshot', 'rapidFire', 'heavyShot', 'vote:dense', 'vote:void', 'ready'] as const;

  it('steps forward and backward through the composed row list', () => {
    expect(nextShopRow('splitshot', 1, rows)).toBe('rapidFire');
    expect(nextShopRow('rapidFire', -1, rows)).toBe('splitshot');
  });

  it('crosses cleanly between upgrade, vote and ready rows', () => {
    expect(nextShopRow('heavyShot', 1, rows)).toBe('vote:dense');
    expect(nextShopRow('vote:void', 1, rows)).toBe('ready');
  });

  it('wraps in both directions', () => {
    expect(nextShopRow('ready', 1, rows)).toBe('splitshot');
    expect(nextShopRow('splitshot', -1, rows)).toBe('ready');
  });

  it('recovers to the first row from a row that is no longer offered', () => {
    expect(nextShopRow('vote:cardinal' as (typeof rows)[number], 1, rows)).toBe('splitshot');
  });

  it('is a no-op with no rows at all', () => {
    expect(nextShopRow('ready', 1, [])).toBe('ready');
  });
});
