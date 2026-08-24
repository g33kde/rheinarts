import type Phaser from 'phaser';

/**
 * Filters out non-standard-mapped "gamepads" before connection-order
 * assignment even sees them - found via a real user report: a Razer
 * peripheral (mouse) was being enumerated by Chrome's Gamepad API
 * alongside an actual Xbox controller, reporting itself as `id: "Unknown
 * Gamepad (Vendor: 1532 Product: 02b0)"` with an empty `mapping`, while
 * the real controller reported `mapping: "standard"`. Connection-order
 * assignment (`GamepadAssignment.ts`) has no way to tell these apart by
 * count alone - it just saw "2 gamepads" and handed the first (the
 * phantom) to whichever slot asked first, leaving that slot dead.
 *
 * `mapping === 'standard'` is the browser's own signal that it recognized
 * the device's button/axis layout as a real gamepad - HID peripherals
 * that aren't actually game controllers essentially never report this,
 * even when the Gamepad API picks them up at all. Not a Debris-specific
 * heuristic - the standard, documented way web games are expected to
 * filter the Gamepad API's noise.
 */
export function filterStandardGamepads(
  pads: readonly Phaser.Input.Gamepad.Gamepad[],
): Phaser.Input.Gamepad.Gamepad[] {
  // Phaser's own Gamepad wrapper doesn't expose `mapping` itself - `.pad`
  // is its reference to the raw native browser Gamepad object (typed
  // `any` in Phaser's own d.ts), which does carry the real W3C Gamepad
  // API `mapping` field this filter actually needs.
  return pads.filter((pad) => (pad.pad as { mapping?: string } | undefined)?.mapping === 'standard');
}
