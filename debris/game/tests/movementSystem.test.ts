import { describe, expect, it } from 'vitest';
import { clampSpeed, wrapAxis, wrapPosition } from '../src/systems/MovementSystem';

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
