import { describe, expect, it } from 'vitest';
import { applyAimSpread, computeLeadAimHeading } from '../src/systems/UfoTargeting';

describe('computeLeadAimHeading', () => {
  it('aims directly at a stationary target', () => {
    const heading = computeLeadAimHeading({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0 }, 5);
    expect(heading).toBeCloseTo(0, 5);
  });

  it('leads a target moving away, aiming further along its path than its current position', () => {
    const straightHeading = computeLeadAimHeading({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0 }, 5);
    const leadHeading = computeLeadAimHeading({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, 5);
    // Target moving in +y means the lead point sits below the target's
    // current position (larger y), so the aim angle should be larger
    // (more downward, screen-space +y) than aiming straight at it.
    expect(leadHeading).toBeGreaterThan(straightHeading);
  });

  it('is stable (zero time-to-hit) when shooter and target coincide', () => {
    const heading = computeLeadAimHeading({ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 1, y: 1 }, 5);
    expect(Number.isFinite(heading)).toBe(true);
  });
});

describe('applyAimSpread', () => {
  it('never exceeds the requested spread bound', () => {
    const base = 0;
    const spread = Math.PI / 10;
    for (let i = 0; i < 200; i += 1) {
      const value = i / 200;
      const result = applyAimSpread(base, spread, () => value);
      expect(result).toBeGreaterThanOrEqual(base - spread);
      expect(result).toBeLessThanOrEqual(base + spread);
    }
  });

  it('returns exactly the base heading with a mid-range rng value', () => {
    expect(applyAimSpread(1.2, Math.PI / 10, () => 0.5)).toBeCloseTo(1.2, 10);
  });
});
