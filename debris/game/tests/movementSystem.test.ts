import { describe, expect, it } from 'vitest';
import { clampSpeed, decayExcessSpeed, wrapAxis, wrapPosition } from '../src/systems/MovementSystem';

describe('wrapAxis', () => {
  it('leaves in-bounds positions untouched', () => {
    expect(wrapAxis(500, 10, 960)).toBe(500);
  });

  it('wraps to the far edge once fully past the low boundary', () => {
    expect(wrapAxis(-11, 10, 960)).toBe(970);
  });

  it('wraps to the near edge once fully past the high boundary', () => {
    expect(wrapAxis(971, 10, 960)).toBe(-10);
  });

  it('does not wrap while still partially on screen (within its own radius)', () => {
    expect(wrapAxis(-5, 10, 960)).toBe(-5);
    expect(wrapAxis(965, 10, 960)).toBe(965);
  });
});

describe('wrapPosition', () => {
  it('wraps both axes independently', () => {
    const result = wrapPosition({ x: -20, y: -20 }, 10, 960, 600);
    expect(result).toEqual({ x: 970, y: 610 });
  });
});

describe('clampSpeed', () => {
  it('leaves velocities under the cap untouched', () => {
    expect(clampSpeed({ x: 3, y: 0 }, 6)).toEqual({ x: 3, y: 0 });
  });

  it('scales velocities over the cap down to exactly maxSpeed, preserving direction', () => {
    const result = clampSpeed({ x: 8, y: 0 }, 6);
    expect(result.x).toBeCloseTo(6, 10);
    expect(result.y).toBeCloseTo(0, 10);
  });

  it('preserves direction for a diagonal over-cap velocity', () => {
    const result = clampSpeed({ x: 10, y: 10 }, 6);
    expect(Math.hypot(result.x, result.y)).toBeCloseTo(6, 10);
    expect(result.x).toBeCloseTo(result.y, 10);
  });

  it('does not divide by zero for a zero velocity', () => {
    expect(clampSpeed({ x: 0, y: 0 }, 6)).toEqual({ x: 0, y: 0 });
  });
});

describe('decayExcessSpeed', () => {
  it('leaves velocities at or under baseSpeed untouched', () => {
    expect(decayExcessSpeed({ x: 0.67, y: 0 }, 0.67, 0.3, 1)).toEqual({ x: 0.67, y: 0 });
    expect(decayExcessSpeed({ x: 0.3, y: 0 }, 0.67, 0.3, 1)).toEqual({ x: 0.3, y: 0 });
  });

  it('decays an over-baseSpeed velocity toward baseSpeed at the given rate, preserving direction', () => {
    const result = decayExcessSpeed({ x: 2, y: 0 }, 0.67, 0.3, 1);
    expect(result.x).toBeCloseTo(1.7, 10); // 2 - 0.3*1
    expect(result.y).toBeCloseTo(0, 10);
  });

  it('never decays past baseSpeed even with a large deltaSeconds/decayPerSecond', () => {
    const result = decayExcessSpeed({ x: 2, y: 0 }, 0.67, 0.3, 100);
    expect(result.x).toBeCloseTo(0.67, 10);
  });

  it('preserves direction for a diagonal over-baseSpeed velocity', () => {
    const result = decayExcessSpeed({ x: 3, y: 3 }, 1, 0.5, 1);
    expect(result.x).toBeCloseTo(result.y, 10);
    expect(Math.hypot(result.x, result.y)).toBeGreaterThan(1);
    expect(Math.hypot(result.x, result.y)).toBeLessThan(Math.hypot(3, 3));
  });

  it('scales down toward baseSpeed exactly once it reaches it (no overshoot below)', () => {
    const result = decayExcessSpeed({ x: 1, y: 0 }, 0.9, 0.5, 0.2); // decays by exactly 0.1
    expect(result.x).toBeCloseTo(0.9, 10);
  });
});
