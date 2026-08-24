import Phaser from 'phaser';

/**
 * Works around a real bug in Phaser 3.90's `GamepadPlugin`
 * (`node_modules/phaser/src/input/gamepad/GamepadPlugin.js`):
 * `stopListeners()` and `disconnectAll()` both loop `this.gamepads` up to
 * `.length` and call a method directly on each entry, with no hole-check -
 * unlike every other method in that file (`getAll()`, `refreshPads()`),
 * which do guard with `if (pads[i])` first. `this.gamepads` is indexed by
 * the browser's own `Gamepad.index` (see `refreshPads()`'s
 * `currentPads[index] = newPad`), which is **not** guaranteed to start at
 * 0 - a controller the browser happens to report at index 1+ leaves
 * `this.gamepads[0]` `undefined`, and `undefined.removeAllListeners()`
 * throws "Cannot read properties of undefined (reading
 * 'removeAllListeners')".
 *
 * `stopListeners()` runs from the outgoing scene's
 * `GamepadPlugin.shutdown()` on every `scene.start()` transition - so this
 * crashed Debris on the very first Menu -> Game transition with a real
 * Xbox controller connected, whenever the browser happened to assign it a
 * non-zero index. Not reproducible with a synthetic pad in this
 * environment (no real gamepad hardware here) - found by reading the
 * Phaser source against a user-reported crash and stack trace.
 *
 * Patched by compacting `this.gamepads` (dropping holes) immediately
 * before calling through to the real implementation, rather than
 * reimplementing either method's body - stays resilient to Phaser
 * internals changing under an unrelated future upgrade, instead of
 * silently drifting out of sync with them.
 */
// `stopListeners()` is real at runtime (confirmed against
// node_modules/phaser/src/input/gamepad/GamepadPlugin.js) but marked
// `@private` in its JSDoc, which Phaser's generated phaser.d.ts omits
// from GamepadPlugin's public surface entirely - `disconnectAll()` is the
// one exception that IS public (it's a documented, since-3.10.0 API), so
// only `stopListeners` needs this escape hatch.
interface GamepadPluginInternals extends Phaser.Input.Gamepad.GamepadPlugin {
  stopListeners(): void;
}

export function patchPhaserGamepadHoleBug(): void {
  const proto = Phaser.Input.Gamepad.GamepadPlugin.prototype as GamepadPluginInternals;
  const originalStopListeners = proto.stopListeners;
  const originalDisconnectAll = proto.disconnectAll;

  proto.stopListeners = function patchedStopListeners(this: GamepadPluginInternals) {
    this.gamepads = this.gamepads.filter(Boolean);
    return originalStopListeners.call(this);
  };

  proto.disconnectAll = function patchedDisconnectAll(this: Phaser.Input.Gamepad.GamepadPlugin) {
    this.gamepads = this.gamepads.filter(Boolean);
    return originalDisconnectAll.call(this);
  };
}
