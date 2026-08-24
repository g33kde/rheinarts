import Phaser from 'phaser';
import { computeGamepadTurnDirection } from '../systems/GamepadInputMapping';
import type { PlayerInput } from './PlayerInput';

// Standard Gamepad API mapping (docs/controls.md) - consistent across
// Xbox/PlayStation/generic controllers, no per-brand special-casing.
const BUTTON_SHOOT = 0; // bottom face button (A / Cross)
const BUTTON_THRUST = 7; // right trigger (R2 / RT)
const BUTTON_DPAD_LEFT = 14;
const BUTTON_DPAD_RIGHT = 15;
const TURN_STICK_DEADZONE = 0.25;

/**
 * Wraps a single already-connected `Phaser.Input.Gamepad.Gamepad` -
 * GameScene binds one of these to a specific pad at round start (see
 * `systems/GamepadAssignment.ts`'s connection-order assignment) and
 * holds onto that same reference for the round, rather than re-resolving
 * "gamepad at index N" every frame; docs/controls.md already accepts
 * that a mid-round disconnect/reconnect can reshuffle indexes, so
 * nothing here tries to recover from that.
 */
export class GamepadInput implements PlayerInput {
  constructor(private readonly pad: Phaser.Input.Gamepad.Gamepad) {}

  get turnDirection(): -1 | 0 | 1 {
    return computeGamepadTurnDirection(
      this.pad.leftStick.x,
      this.pad.buttons[BUTTON_DPAD_LEFT]?.pressed ?? false,
      this.pad.buttons[BUTTON_DPAD_RIGHT]?.pressed ?? false,
      TURN_STICK_DEADZONE,
    );
  }

  get isThrusting(): boolean {
    return this.pad.buttons[BUTTON_THRUST]?.pressed ?? false;
  }

  get isFiring(): boolean {
    return this.pad.buttons[BUTTON_SHOOT]?.pressed ?? false;
  }
}
