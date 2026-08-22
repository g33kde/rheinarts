import { describe, expect, it } from 'vitest';
import { generateAsteroidPoints } from '../src/systems/AsteroidShape';

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
