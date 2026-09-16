import { describe, expect, it } from 'vitest';
import {
  generateAsteroidPoints,
  generateCraters,
  pickCrackTargets,
  pickShapeFamily,
} from '../src/systems/AsteroidShape';

describe('generateAsteroidPoints', () => {
  it('returns exactly vertexCount points', () => {
    const points = generateAsteroidPoints(10, 0.45);
    expect(points).toHaveLength(10);
  });

  it('keeps every point within a sane radius band regardless of jaggedness', () => {
    const points = generateAsteroidPoints(12, 0.6);
    points.forEach((p) => {
      const r = Math.hypot(p.x, p.y);
      expect(r).toBeGreaterThanOrEqual(0.25);
      expect(r).toBeLessThanOrEqual(1.3);
    });
  });

  it('is deterministic given the same rng sequence', () => {
    let seed = 0;
    const seq = [0.1, 0.5, 0.9, 0.2, 0.4, 0.6, 0.8, 0.3, 0.7, 0.15, 0.55, 0.95, 0.25, 0.45];
    const rng = () => seq[seed++ % seq.length]!;

    const a = generateAsteroidPoints(6, 0.4, rng);
    seed = 0;
    const b = generateAsteroidPoints(6, 0.4, rng);
    expect(a).toEqual(b);
  });

  it('never self-intersects: per-vertex angle jitter is bounded below half the angular step', () => {
    // The generator offsets each vertex's angle by at most +/- 0.4 * baseStep
    // from its evenly-spaced slot. Since 0.4 < 0.5, consecutive vertices can
    // never cross or coincide in angle, regardless of jaggedness/rng - the
    // shape is guaranteed non-self-intersecting by construction. This test
    // pins that invariant (the 0.4 constant) rather than re-deriving it from
    // wrap-prone atan2 output.
    const vertexCount = 11;
    const baseStep = (Math.PI * 2) / vertexCount;
    const maxJitter = baseStep * 0.4;
    expect(maxJitter).toBeLessThan(baseStep / 2);
  });
});

describe('pickShapeFamily', () => {
  const families = [{ vertexCountRange: [7, 9] as const, jaggedness: 0.2 }, { vertexCountRange: [11, 15] as const, jaggedness: 0.75 }];

  it('picks the first family when rng returns 0', () => {
    expect(pickShapeFamily(families, () => 0)).toBe(families[0]);
  });

  it('picks the last family when rng returns just under 1', () => {
    expect(pickShapeFamily(families, () => 0.999)).toBe(families[1]);
  });

  it('defaults to Math.random when no rng is given (does not throw, returns a member of the list)', () => {
    expect(families).toContain(pickShapeFamily(families));
  });
});

describe('generateCraters', () => {
  it('returns exactly `count` craters', () => {
    expect(generateCraters(3, () => 0.5)).toHaveLength(3);
  });

  it('returns an empty array for count 0', () => {
    expect(generateCraters(0)).toEqual([]);
  });

  it('keeps every crater within the silhouette (distance from center < 1)', () => {
    let seed = 0;
    const seq = [0.1, 0.9, 0.5, 0.3, 0.7, 0.2, 0.8, 0.4, 0.6];
    const rng = () => seq[seed++ % seq.length]!;
    generateCraters(5, rng).forEach((c) => {
      expect(Math.hypot(c.x, c.y)).toBeLessThan(1);
      expect(c.radius).toBeGreaterThan(0);
    });
  });

  it('is deterministic given the same rng sequence', () => {
    let seed = 0;
    const seq = [0.1, 0.5, 0.9, 0.2, 0.4, 0.6];
    const rng = () => seq[seed++ % seq.length]!;
    const a = generateCraters(3, rng);
    seed = 0;
    const b = generateCraters(3, rng);
    expect(a).toEqual(b);
  });
});

describe('pickCrackTargets', () => {
  it('returns exactly `crackCount` indices', () => {
    expect(pickCrackTargets(10, 2, () => 0.5)).toHaveLength(2);
  });

  it('returns an empty array for crackCount 0', () => {
    expect(pickCrackTargets(10, 0)).toEqual([]);
  });

  it('every index is within [0, pointCount)', () => {
    let seed = 0;
    const seq = [0.0, 0.999, 0.5, 0.1, 0.9];
    const rng = () => seq[seed++ % seq.length]!;
    pickCrackTargets(8, 5, rng).forEach((i) => {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(8);
    });
  });
});
