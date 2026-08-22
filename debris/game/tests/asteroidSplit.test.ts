import { describe, expect, it } from 'vitest';
import { nextAsteroidSize, splitHeading } from '../src/systems/AsteroidSplit';

describe('nextAsteroidSize', () => {
  it('splits large into medium', () => {
    expect(nextAsteroidSize('large')).toBe('medium');
  });

  it('splits medium into small', () => {
    expect(nextAsteroidSize('medium')).toBe('small');
  });

  it('destroys small for good', () => {
    expect(nextAsteroidSize('small')).toBeNull();
  });
});

describe('splitHeading', () => {
  it('stays within the configured spread of the parent heading', () => {
    const parent = 0;
    for (let i = 0; i < 50; i++) {
      const heading = splitHeading(parent, () => i / 50);
      const delta = Math.abs(heading - parent);
      expect(delta).toBeLessThanOrEqual(Math.PI / 3 + 1e-9);
    }
  });

  it('is deterministic for a given rng value', () => {
    const rng = () => 0.75;
    expect(splitHeading(1.2, rng)).toBe(splitHeading(1.2, rng));
  });

  it('returns the parent heading unchanged at the rng midpoint', () => {
    expect(splitHeading(0.5, () => 0.5)).toBeCloseTo(0.5, 10);
  });
});
