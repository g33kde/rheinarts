import { describe, expect, it } from 'vitest';
import { canFire, isExpired, projectileVelocity } from '../src/systems/CombatSystem';

describe('canFire', () => {
  it('blocks firing before the cooldown has elapsed', () => {
    expect(canFire(1000, 1100, 220)).toBe(false);
  });

  it('allows firing once the cooldown has elapsed', () => {
    expect(canFire(1000, 1220, 220)).toBe(true);
  });
});

describe('projectileVelocity', () => {
  it('scales the normalized aim direction by speed', () => {
    const velocity = projectileVelocity({ x: 0, y: -1 }, 500);
    expect(velocity).toEqual({ x: 0, y: -500 });
  });

  it('normalizes non-unit aim vectors', () => {
    const velocity = projectileVelocity({ x: 3, y: 4 }, 10);
    expect(velocity.x).toBeCloseTo(6, 5);
    expect(velocity.y).toBeCloseTo(8, 5);
  });
});

describe('isExpired', () => {
  it('is false while within lifetime', () => {
    expect(isExpired(0, 500, 1200)).toBe(false);
  });

  it('is true once lifetime has elapsed', () => {
    expect(isExpired(0, 1200, 1200)).toBe(true);
  });
});
