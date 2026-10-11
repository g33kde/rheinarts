import { describe, expect, it } from 'vitest';
import { smoothedPosition } from '../src/systems/PositionSmoothing';

const ARENA_WIDTH = 1920;
const ARENA_HEIGHT = 1080;

describe('smoothedPosition', () => {
  it('moves only a fraction of the remaining distance toward the target', () => {
    const result = smoothedPosition({ x: 0, y: 0 }, { x: 100, y: 0 }, ARENA_WIDTH, ARENA_HEIGHT, 0.5);
    expect(result).toEqual({ x: 50, y: 0 });
  });

  it('stays put once already at the target', () => {
    const result = smoothedPosition({ x: 42, y: 7 }, { x: 42, y: 7 }, ARENA_WIDTH, ARENA_HEIGHT);
    expect(result).toEqual({ x: 42, y: 7 });
  });

  it('converges toward the target over repeated steps without ever overshooting', () => {
    let current = { x: 0, y: 0 };
    const target = { x: 200, y: -50 };
    for (let i = 0; i < 50; i += 1) {
      current = smoothedPosition(current, target, ARENA_WIDTH, ARENA_HEIGHT, 0.3);
    }
    expect(current.x).toBeCloseTo(target.x, 1);
    expect(current.y).toBeCloseTo(target.y, 1);
  });

  it('snaps straight to the target on a horizontal wrap-sized jump instead of interpolating', () => {
    const result = smoothedPosition({ x: 10, y: 500 }, { x: ARENA_WIDTH - 10, y: 500 }, ARENA_WIDTH, ARENA_HEIGHT);
    expect(result).toEqual({ x: ARENA_WIDTH - 10, y: 500 });
  });

  it('snaps straight to the target on a vertical wrap-sized jump instead of interpolating', () => {
    const result = smoothedPosition({ x: 500, y: 10 }, { x: 500, y: ARENA_HEIGHT - 10 }, ARENA_WIDTH, ARENA_HEIGHT);
    expect(result).toEqual({ x: 500, y: ARENA_HEIGHT - 10 });
  });

  it('does not snap for an ordinary large-but-sub-wrap movement', () => {
    const result = smoothedPosition({ x: 0, y: 0 }, { x: ARENA_WIDTH / 2 - 1, y: 0 }, ARENA_WIDTH, ARENA_HEIGHT, 0.5);
    expect(result).not.toEqual({ x: ARENA_WIDTH / 2 - 1, y: 0 });
    expect(result.x).toBeCloseTo((ARENA_WIDTH / 2 - 1) / 2, 5);
  });
});
