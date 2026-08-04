import { describe, expect, it } from 'vitest';
import { UPGRADE_EFFECTS } from '../src/config/GameConfig';
import {
  applyUpgrade,
  consumeShieldCharge,
  defaultUpgradeState,
  hasShieldCharge,
} from '../src/systems/UpgradeSystem';

describe('defaultUpgradeState', () => {
  it('starts with neutral multipliers and no shield charges', () => {
    expect(defaultUpgradeState()).toEqual({
      speedMultiplier: 1,
      fireCooldownMultiplier: 1,
      shieldCharges: 0,
    });
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

  it('caps the speed multiplier instead of stacking forever (guaranteed one per floor - see FloorPickups.ts)', () => {
    let state = defaultUpgradeState();
    for (let i = 0; i < 20; i += 1) {
      state = applyUpgrade(state, 'speed');
    }
    expect(state.speedMultiplier).toBe(UPGRADE_EFFECTS.speedMultiplierCap);
  });

  it('floors the fire cooldown multiplier instead of shrinking forever', () => {
    let state = defaultUpgradeState();
    for (let i = 0; i < 20; i += 1) {
      state = applyUpgrade(state, 'rapidFire');
    }
    expect(state.fireCooldownMultiplier).toBe(UPGRADE_EFFECTS.fireCooldownMultiplierFloor);
  });

  it('grants a shield charge and stacks across pickups', () => {
    let state = applyUpgrade(defaultUpgradeState(), 'shield');
    expect(state.shieldCharges).toBe(1);
    state = applyUpgrade(state, 'shield');
    expect(state.shieldCharges).toBe(2);
  });

  it('leaves state untouched for extraLife (handled separately via HealthSystem)', () => {
    const before = defaultUpgradeState();
    expect(applyUpgrade(before, 'extraLife')).toEqual(before);
  });

  it('does not mutate the input state', () => {
    const before = defaultUpgradeState();
    applyUpgrade(before, 'speed');
    expect(before).toEqual({ speedMultiplier: 1, fireCooldownMultiplier: 1, shieldCharges: 0 });
  });
});

describe('hasShieldCharge / consumeShieldCharge', () => {
  it('is false with no charges, true once granted', () => {
    expect(hasShieldCharge(defaultUpgradeState())).toBe(false);
    expect(hasShieldCharge(applyUpgrade(defaultUpgradeState(), 'shield'))).toBe(true);
  });

  it('consuming a charge decrements it and never goes below zero', () => {
    const oneCharge = applyUpgrade(defaultUpgradeState(), 'shield');
    const consumed = consumeShieldCharge(oneCharge);
    expect(consumed.shieldCharges).toBe(0);
    expect(consumeShieldCharge(consumed).shieldCharges).toBe(0);
  });
});
