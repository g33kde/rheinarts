import { describe, expect, it } from 'vitest';
import {
  bonusStartingLives,
  emptyProgression,
  loadProgression,
  recordMazeCleared,
  saveProgression,
} from '../src/systems/ProgressionStorage';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    data,
  };
}

describe('loadProgression', () => {
  it('returns empty progression when nothing is stored', () => {
    expect(loadProgression(fakeStorage())).toEqual(emptyProgression());
  });

  it('returns empty progression for corrupt JSON instead of throwing', () => {
    const storage = fakeStorage({ 'godspeed:progression': 'not json' });
    expect(loadProgression(storage)).toEqual(emptyProgression());
  });

  it('round-trips through saveProgression', () => {
    const storage = fakeStorage();
    saveProgression(recordMazeCleared(emptyProgression()), storage);
    expect(loadProgression(storage)).toEqual({ mazesCleared: 1 });
  });
});

describe('recordMazeCleared', () => {
  it('increments the cleared count without mutating the input', () => {
    const before = emptyProgression();
    const after = recordMazeCleared(before);
    expect(after.mazesCleared).toBe(1);
    expect(before.mazesCleared).toBe(0);
  });
});

describe('bonusStartingLives', () => {
  it('grants no bonus before any maze has been cleared', () => {
    expect(bonusStartingLives(emptyProgression())).toBe(0);
  });

  it('grants a bonus life after the first clear', () => {
    expect(bonusStartingLives(recordMazeCleared(emptyProgression()))).toBe(1);
  });
});
