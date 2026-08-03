import { describe, expect, it } from 'vitest';
import {
  circleIntersectsAnyRect,
  circleIntersectsRect,
  circlesIntersect,
  resolveCircleRectCollision,
  resolveCircleRectCollisions,
} from '../src/systems/CollisionSystem';

const rect = { x: 100, y: 100, width: 40, height: 40 };

describe('circleIntersectsRect', () => {
  it('is false when the circle is well clear of the rect', () => {
    expect(circleIntersectsRect({ x: 0, y: 0 }, 10, rect)).toBe(false);
  });

  it('is true when the circle overlaps the rect edge', () => {
    expect(circleIntersectsRect({ x: 95, y: 120 }, 10, rect)).toBe(true);
  });
});

describe('resolveCircleRectCollision', () => {
  it('leaves non-overlapping positions untouched', () => {
    const position = { x: 0, y: 0 };
    expect(resolveCircleRectCollision(position, 10, rect)).toEqual(position);
  });

  it('pushes the circle out to just touch the rect edge', () => {
    const resolved = resolveCircleRectCollision({ x: 95, y: 120 }, 10, rect);
    expect(resolved).toEqual({ x: 90, y: 120 });

    const distance = Math.hypot(resolved.x - 100, resolved.y - 120);
    expect(distance).toBeCloseTo(10, 5);
  });

  it('does not crash when the circle center sits exactly on the rect (degenerate case)', () => {
    const resolved = resolveCircleRectCollision({ x: 120, y: 120 }, 5, rect);
    expect(Number.isFinite(resolved.x)).toBe(true);
    expect(Number.isFinite(resolved.y)).toBe(true);
  });
});

describe('circleIntersectsAnyRect / resolveCircleRectCollisions', () => {
  const rects = [rect, { x: 200, y: 100, width: 40, height: 40 }];

  it('detects intersection against a list of rects', () => {
    expect(circleIntersectsAnyRect({ x: 95, y: 120 }, 10, rects)).toBe(true);
    expect(circleIntersectsAnyRect({ x: 0, y: 0 }, 10, rects)).toBe(false);
  });

  it('resolves against whichever rect in the list is overlapping', () => {
    const resolved = resolveCircleRectCollisions({ x: 195, y: 120 }, 10, rects);
    expect(resolved.x).toBeCloseTo(190, 5);
  });
});

describe('circlesIntersect', () => {
  it('is false when circles are farther apart than the sum of their radii', () => {
    expect(circlesIntersect({ x: 0, y: 0 }, 10, { x: 100, y: 0 }, 10)).toBe(false);
  });

  it('is true when circles overlap', () => {
    expect(circlesIntersect({ x: 0, y: 0 }, 10, { x: 15, y: 0 }, 10)).toBe(true);
  });

  it('is false when circles exactly touch (strict overlap only)', () => {
    expect(circlesIntersect({ x: 0, y: 0 }, 10, { x: 20, y: 0 }, 10)).toBe(false);
  });
});
