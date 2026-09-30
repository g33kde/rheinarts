import { describe, expect, it } from 'vitest';
import {
  breakCombo,
  comboMultiplier,
  decayCombo,
  INITIAL_COMBO_STATE,
  isComboExpired,
  registerKill,
  type ComboConfig,
} from '../src/systems/ComboMultiplier';

const CONFIG: ComboConfig = { windowMs: 2500, killsPerStep: 2, maxMultiplier: 8 };

describe('registerKill', () => {
  it('starts a chain from nothing', () => {
    expect(registerKill(INITIAL_COMBO_STATE, 1000, CONFIG)).toEqual({ chain: 1, lastKillAtMs: 1000 });
  });

  it('extends a live chain and refreshes the window', () => {
    const first = registerKill(INITIAL_COMBO_STATE, 1000, CONFIG);
    const second = registerKill(first, 2000, CONFIG);
    expect(second).toEqual({ chain: 2, lastKillAtMs: 2000 });
  });

  it('restarts rather than extends once the window has lapsed', () => {
    const first = registerKill(INITIAL_COMBO_STATE, 1000, CONFIG);
    // 2500ms later exactly - the window is closed, so this is a new chain
    expect(registerKill(first, 3500, CONFIG)).toEqual({ chain: 1, lastKillAtMs: 3500 });
  });
});

describe('isComboExpired', () => {
  it('treats "no chain at all" as expired', () => {
    expect(isComboExpired(INITIAL_COMBO_STATE, 0, CONFIG)).toBe(true);
  });

  it('stays live inside the window and lapses on its boundary', () => {
    const state = registerKill(INITIAL_COMBO_STATE, 1000, CONFIG);
    expect(isComboExpired(state, 3499, CONFIG)).toBe(false);
    expect(isComboExpired(state, 3500, CONFIG)).toBe(true);
  });
});

describe('decayCombo', () => {
  it('leaves a live chain untouched', () => {
    const state = registerKill(INITIAL_COMBO_STATE, 1000, CONFIG);
    expect(decayCombo(state, 2000, CONFIG)).toBe(state);
  });

  it('clears a lapsed chain', () => {
    const state = registerKill(INITIAL_COMBO_STATE, 1000, CONFIG);
    expect(decayCombo(state, 9999, CONFIG)).toEqual(INITIAL_COMBO_STATE);
  });

  it('is a no-op when there was never a chain', () => {
    expect(decayCombo(INITIAL_COMBO_STATE, 9999, CONFIG)).toBe(INITIAL_COMBO_STATE);
  });
});

describe('comboMultiplier', () => {
  it('is 1 with no chain, so callers can multiply unconditionally', () => {
    expect(comboMultiplier(INITIAL_COMBO_STATE, CONFIG)).toBe(1);
  });

  it('climbs one step per killsPerStep kills', () => {
    const at = (chain: number) => comboMultiplier({ chain, lastKillAtMs: 0 }, CONFIG);
    expect(at(1)).toBe(1);
    expect(at(2)).toBe(2);
    expect(at(3)).toBe(2);
    expect(at(4)).toBe(3);
    expect(at(10)).toBe(6);
  });

  it('never exceeds maxMultiplier', () => {
    expect(comboMultiplier({ chain: 14, lastKillAtMs: 0 }, CONFIG)).toBe(8);
    expect(comboMultiplier({ chain: 500, lastKillAtMs: 0 }, CONFIG)).toBe(8);
  });
});

describe('breakCombo', () => {
  it('wipes a chain of any size back to nothing', () => {
    expect(breakCombo()).toEqual(INITIAL_COMBO_STATE);
    expect(comboMultiplier(breakCombo(), CONFIG)).toBe(1);
  });
});
