import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLeaderboard, qualifiesForLeaderboard, submitHighScore } from '../src/systems/HighScoreApi';

function makeEntries(scores: number[]) {
  return scores.map((score, i) => ({ initials: `P${i}`.padEnd(3, 'X'), score }));
}

describe('qualifiesForLeaderboard', () => {
  it('is true whenever the board has room', () => {
    expect(qualifiesForLeaderboard([], 1, 10)).toBe(true);
    expect(qualifiesForLeaderboard(makeEntries([500]), 1, 10)).toBe(true);
  });

  it('is true only above the lowest entry once the board is full', () => {
    const full = makeEntries([1000, 900, 800, 700, 600, 500, 400, 300, 200, 100]);
    expect(qualifiesForLeaderboard(full, 150, 10)).toBe(true);
    expect(qualifiesForLeaderboard(full, 100, 10)).toBe(false);
    expect(qualifiesForLeaderboard(full, 50, 10)).toBe(false);
  });
});

describe('fetchLeaderboard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the parsed array on success', async () => {
    const entries = makeEntries([500, 300]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(entries) }),
    );
    expect(await fetchLeaderboard('singlePlayer')).toEqual(entries);
  });

  it('degrades to an empty array on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve([]) }));
    expect(await fetchLeaderboard('singlePlayer')).toEqual([]);
  });

  it('degrades to an empty array when fetch itself throws (offline, API down)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    expect(await fetchLeaderboard('singlePlayer')).toEqual([]);
  });
});

describe('submitHighScore', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the parsed response on success', async () => {
    const body = { accepted: true, highscores: makeEntries([999]) };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) }));
    expect(await submitHighScore('ABC', 999, 'singlePlayer')).toEqual(body);
  });

  it('degrades to accepted:false on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({}) }));
    expect(await submitHighScore('ABC', 999, 'singlePlayer')).toEqual({ accepted: false, highscores: [] });
  });

  it('degrades to accepted:false when fetch itself throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    expect(await submitHighScore('ABC', 999, 'singlePlayer')).toEqual({ accepted: false, highscores: [] });
  });
});
