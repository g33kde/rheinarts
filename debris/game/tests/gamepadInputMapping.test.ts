import { describe, expect, it } from 'vitest';
import { computeGamepadTurnDirection } from '../src/systems/GamepadInputMapping';

describe('computeGamepadTurnDirection', () => {
  const DEADZONE = 0.25;

  it('is neutral with a centered stick and no D-pad press', () => {
    expect(computeGamepadTurnDirection(0, false, false, DEADZONE)).toBe(0);
  });

  it('ignores small stick drift inside the deadzone', () => {
    expect(computeGamepadTurnDirection(0.1, false, false, DEADZONE)).toBe(0);
    expect(computeGamepadTurnDirection(-0.1, false, false, DEADZONE)).toBe(0);
  });

  it('turns from the stick once past the deadzone', () => {
    expect(computeGamepadTurnDirection(0.5, false, false, DEADZONE)).toBe(1);
    expect(computeGamepadTurnDirection(-0.5, false, false, DEADZONE)).toBe(-1);
  });

  it('D-pad works independently of the stick', () => {
    expect(computeGamepadTurnDirection(0, true, false, DEADZONE)).toBe(-1);
    expect(computeGamepadTurnDirection(0, false, true, DEADZONE)).toBe(1);
  });

  it('D-pad wins over a disagreeing stick', () => {
    expect(computeGamepadTurnDirection(1, true, false, DEADZONE)).toBe(-1);
    expect(computeGamepadTurnDirection(-1, false, true, DEADZONE)).toBe(1);
  });

  it('both D-pad directions pressed at once cancels out to neutral', () => {
    expect(computeGamepadTurnDirection(0, true, true, DEADZONE)).toBe(0);
  });
});
