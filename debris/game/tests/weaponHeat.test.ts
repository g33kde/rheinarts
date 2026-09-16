import { describe, expect, it } from 'vitest';
import { applyShotHeat, decayHeat, INITIAL_HEAT_STATE, isOverheated, type HeatConfig } from '../src/systems/WeaponHeat';

const CONFIG: HeatConfig = {
  enabled: true,
  heatPerShot: 25,
  maxHeat: 100,
  decayPerSecond: 20,
  overheatLockoutMs: 1500,
};

describe('applyShotHeat', () => {
  it('adds heatPerShot for a single trigger-pull', () => {
    const next = applyShotHeat(INITIAL_HEAT_STATE, 1000, CONFIG);
    expect(next.heat).toBe(25);
    expect(next.overheatedUntilMs).toBeUndefined();
  });

  it('caps heat at maxHeat and starts an overheat lockout once it hits the cap', () => {
    const near = { heat: 90, overheatedUntilMs: undefined };
    const next = applyShotHeat(near, 5000, CONFIG);
    expect(next.heat).toBe(100);
    expect(next.overheatedUntilMs).toBe(6500);
  });

  it('is a no-op when the heat system is disabled', () => {
    const disabled: HeatConfig = { ...CONFIG, enabled: false };
    const state = { heat: 10, overheatedUntilMs: undefined };
    expect(applyShotHeat(state, 1000, disabled)).toBe(state);
  });

  it('does not add heat per Splitshot pellet - callers invoke this once per trigger-pull, not per projectile', () => {
    // Documents the contract, not the function itself: a single call
    // regardless of how many projectiles that trigger-pull spawned.
    const next = applyShotHeat(INITIAL_HEAT_STATE, 0, CONFIG);
    expect(next.heat).toBe(CONFIG.heatPerShot);
  });
});

describe('decayHeat', () => {
  it('reduces heat over time, never below zero', () => {
    const state = { heat: 10, overheatedUntilMs: undefined };
    expect(decayHeat(state, 1, CONFIG).heat).toBe(0);
  });

  it('keeps decaying underneath an active overheat lockout, rather than freezing at maxHeat', () => {
    const state = { heat: 100, overheatedUntilMs: 5000 };
    const next = decayHeat(state, 1, CONFIG);
    expect(next.heat).toBe(80);
    expect(next.overheatedUntilMs).toBe(5000); // lockout duration is untouched by decay
  });

  it('is a no-op when the heat system is disabled', () => {
    const disabled: HeatConfig = { ...CONFIG, enabled: false };
    const state = { heat: 10, overheatedUntilMs: undefined };
    expect(decayHeat(state, 1, disabled)).toBe(state);
  });
});

describe('isOverheated', () => {
  it('is false with no lockout set', () => {
    expect(isOverheated(INITIAL_HEAT_STATE, 1000)).toBe(false);
  });

  it('is true before the lockout timestamp', () => {
    expect(isOverheated({ heat: 100, overheatedUntilMs: 2000 }, 1500)).toBe(true);
  });

  it('is false once the lockout timestamp has passed', () => {
    expect(isOverheated({ heat: 100, overheatedUntilMs: 2000 }, 2000)).toBe(false);
  });
});
