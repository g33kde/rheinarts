import { describe, expect, it } from 'vitest';
import { computeGamepadReadiness } from '../src/systems/GamepadAssignment';

describe('computeGamepadReadiness', () => {
  it('keyboard slots are always ready, regardless of gamepad count', () => {
    expect(computeGamepadReadiness(['keyboard', 'keyboard'], 0)).toEqual([true, true]);
  });

  it('claims connected gamepads in slot order', () => {
    expect(computeGamepadReadiness(['gamepad', 'gamepad', 'gamepad', 'gamepad'], 2)).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it('mixes keyboard and gamepad slots without keyboard slots consuming a controller', () => {
    expect(computeGamepadReadiness(['keyboard', 'gamepad', 'gamepad', 'gamepad'], 1)).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it('no connected gamepads leaves every gamepad slot waiting', () => {
    expect(computeGamepadReadiness(['gamepad', 'gamepad'], 0)).toEqual([false, false]);
  });
});
