import { describe, expect, it } from 'vitest';
import {
  filePathForMode,
  insertEntry,
  isValidInitials,
  isValidMode,
  isValidScore,
  normalizeInitials,
  qualifies,
  type LeaderboardEntry,
} from '../src/leaderboard';

describe('normalizeInitials', () => {
  it('uppercases and trims', () => {
    expect(normalizeInitials(' abc ')).toBe('ABC');
  });
});

describe('isValidInitials', () => {
  it('accepts exactly 3 uppercase letters', () => {
    expect(isValidInitials('ABC')).toBe(true);
  });

  it('rejects the wrong length', () => {
    expect(isValidInitials('AB')).toBe(false);
    expect(isValidInitials('ABCD')).toBe(false);
    expect(isValidInitials('')).toBe(false);
  });

  it('rejects non-letters and lowercase (normalize first)', () => {
    expect(isValidInitials('A1C')).toBe(false);
    expect(isValidInitials('abc')).toBe(false);
    expect(isValidInitials('A-C')).toBe(false);
  });
});

describe('isValidScore', () => {
  it('accepts a plain non-negative integer', () => {
    expect(isValidScore(0)).toBe(true);
    expect(isValidScore(4200)).toBe(true);
  });

  it('rejects negative, non-integer, non-finite, and non-number values', () => {
    expect(isValidScore(-1)).toBe(false);
    expect(isValidScore(4.5)).toBe(false);
    expect(isValidScore(Infinity)).toBe(false);
    expect(isValidScore(NaN)).toBe(false);
    expect(isValidScore('4200')).toBe(false);
    expect(isValidScore(null)).toBe(false);
    expect(isValidScore(undefined)).toBe(false);
  });

  it('rejects a score past the sanity bound', () => {
    expect(isValidScore(1_000_001)).toBe(false);
    expect(isValidScore(1_000_000)).toBe(true);
  });
});

function makeEntries(scores: number[]): LeaderboardEntry[] {
  return scores.map((score, i) => ({ initials: `P${i}${i}`.slice(0, 3).toUpperCase(), score }));
}

describe('qualifies', () => {
  it('is true whenever the board has room', () => {
    expect(qualifies([], 1, 10)).toBe(true);
    expect(qualifies(makeEntries([500]), 1, 10)).toBe(true);
  });

  it('is true only above the lowest entry once the board is full', () => {
    const full = makeEntries([1000, 900, 800, 700, 600, 500, 400, 300, 200, 100]);
    expect(qualifies(full, 150, 10)).toBe(true);
    expect(qualifies(full, 100, 10)).toBe(false); // a tie doesn't displace anyone
    expect(qualifies(full, 50, 10)).toBe(false);
  });
});

describe('insertEntry', () => {
  it('inserts in descending-score order', () => {
    const entries = makeEntries([500, 300]);
    const result = insertEntry(entries, { initials: 'NEW', score: 400 }, 10);
    expect(result.map((e) => e.score)).toEqual([500, 400, 300]);
  });

  it('trims to maxEntries, dropping the lowest', () => {
    const entries = makeEntries([1000, 900, 800]);
    const result = insertEntry(entries, { initials: 'NEW', score: 850 }, 3);
    expect(result.map((e) => e.score)).toEqual([1000, 900, 850]);
    expect(result).toHaveLength(3);
  });

  it('does not mutate the input array', () => {
    const entries = makeEntries([500]);
    insertEntry(entries, { initials: 'NEW', score: 999 }, 10);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.score).toBe(500);
  });
});

describe('isValidMode', () => {
  it('accepts the three known modes', () => {
    expect(isValidMode('singlePlayer')).toBe(true);
    expect(isValidMode('cooperative')).toBe(true);
    expect(isValidMode('competitive')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isValidMode('coop')).toBe(false);
    expect(isValidMode('')).toBe(false);
    expect(isValidMode(null)).toBe(false);
    expect(isValidMode(undefined)).toBe(false);
    expect(isValidMode(42)).toBe(false);
  });
});

describe('filePathForMode', () => {
  it('singlePlayer keeps the base path exactly - no migration for the pre-existing live file', () => {
    expect(filePathForMode('./data/debris-highscores.json', 'singlePlayer')).toBe(
      './data/debris-highscores.json',
    );
  });

  it('cooperative/competitive get a sibling file with the mode suffixed before .json', () => {
    expect(filePathForMode('./data/debris-highscores.json', 'cooperative')).toBe(
      './data/debris-highscores-cooperative.json',
    );
    expect(filePathForMode('./data/debris-highscores.json', 'competitive')).toBe(
      './data/debris-highscores-competitive.json',
    );
  });

  it('still works if the base path has no .json extension', () => {
    expect(filePathForMode('./data/debris-highscores', 'cooperative')).toBe(
      './data/debris-highscores-cooperative.json',
    );
  });
});
