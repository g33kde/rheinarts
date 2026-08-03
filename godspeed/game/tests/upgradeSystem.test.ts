import { describe, expect, it } from 'vitest';
import { applyUpgrade, defaultUpgradeState } from '../src/systems/UpgradeSystem';

describe('defaultUpgradeState', () => {
  it('starts with neutral multipliers', () => {
    expect(defaultUpgradeState()).toEqual({ speedMultiplier: 1, fireCooldownMultiplier: 1 });
  });
});

describe('applyUpgrade', () => {
  it('increases the speed multiplier and stacks across pickups', () => {
    let state = defaultUpgradeState();
    state = applyUpgrade(state, 'speed');
    expect(state.speedMultiplier).toBeGreaterThan(1);

    const afterOne = state.speedMultiplier;
    state = applyUpgrade(state, 'speed');
    expect(state.speedMultiplier).toBeGreaterThan(afterOne);
  });

  it('reduces the fire cooldown multiplier (faster firing)', () => {
    const state = applyUpgrade(defaultUpgradeState(), 'rapidFire');
    expect(state.fireCooldownMultiplier).toBeLessThan(1);
  });

  it('leaves state untouched for extraLife (handled separately via HealthSystem)', () => {
    const before = defaultUpgradeState();
    expect(applyUpgrade(before, 'extraLife')).toEqual(before);
  });

  it('does not mutate the input state', () => {
    const before = defaultUpgradeState();
    applyUpgrade(before, 'speed');
    expect(before).toEqual({ speedMultiplier: 1, fireCooldownMultiplier: 1 });
  });
});
