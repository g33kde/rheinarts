import { describe, expect, it } from 'vitest';
import { computeGamepadReadiness, computeSlotAssignments } from '../src/systems/GamepadAssignment';

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

describe('computeSlotAssignments', () => {
  it('keyboard slots are ready with no gamepad index', () => {
    expect(computeSlotAssignments(['keyboard'], 0)).toEqual([{ ready: true, gamepadIndex: null }]);
  });

  it('assigns gamepad indexes in slot order, skipping keyboard slots', () => {
    expect(computeSlotAssignments(['keyboard', 'gamepad', 'gamepad', 'gamepad'], 2)).toEqual([
      { ready: true, gamepadIndex: null },
      { ready: true, gamepadIndex: 0 },
      { ready: true, gamepadIndex: 1 },
      { ready: false, gamepadIndex: null },
    ]);
  });

  it('an unready gamepad slot has no index at all, not just ready: false', () => {
    const [assignment] = computeSlotAssignments(['gamepad'], 0);
    expect(assignment).toEqual({ ready: false, gamepadIndex: null });
  });
});
