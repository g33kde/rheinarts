import { describe, expect, it } from 'vitest';
import { canFire } from '../src/systems/CombatSystem';

describe('canFire', () => {
  it('is false before the cooldown elapses', () => {
    expect(canFire(1000, 1100, 250)).toBe(false);
  });

  it('is true once the cooldown has fully elapsed', () => {
    expect(canFire(1000, 1250, 250)).toBe(true);
  });

  it('is true on the very first call (lastFiredAtMs in the far past)', () => {
    expect(canFire(-Infinity, 0, 250)).toBe(true);
  });
});
