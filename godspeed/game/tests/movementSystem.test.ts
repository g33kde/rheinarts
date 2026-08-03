import { describe, expect, it } from 'vitest';
import { clampToBounds, computeNextPosition } from '../src/systems/MovementSystem';

describe('computeNextPosition', () => {
  it('moves in the given direction scaled by speed and time', () => {
    const next = computeNextPosition({ x: 0, y: 0 }, { x: 1, y: 0 }, 100, 1);
    expect(next).toEqual({ x: 100, y: 0 });
  });

  it('normalizes diagonal movement so it is not faster than cardinal movement', () => {
    const next = computeNextPosition({ x: 0, y: 0 }, { x: 1, y: 1 }, 100, 1);
    const distance = Math.hypot(next.x, next.y);
    expect(distance).toBeCloseTo(100, 5);
  });

  it('does not move when direction is zero', () => {
    const next = computeNextPosition({ x: 50, y: 50 }, { x: 0, y: 0 }, 100, 1);
    expect(next).toEqual({ x: 50, y: 50 });
  });
});

describe('clampToBounds', () => {
  it('leaves in-bounds positions untouched', () => {
    const position = clampToBounds({ x: 50, y: 50 }, 10, 200, 200);
    expect(position).toEqual({ x: 50, y: 50 });
  });

  it('clamps positions outside the arena, accounting for radius', () => {
    expect(clampToBounds({ x: -20, y: -20 }, 10, 200, 200)).toEqual({ x: 10, y: 10 });
    expect(clampToBounds({ x: 500, y: 500 }, 10, 200, 200)).toEqual({ x: 190, y: 190 });
  });
});
