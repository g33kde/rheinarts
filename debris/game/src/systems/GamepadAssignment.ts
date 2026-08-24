export type InputSource = 'keyboard' | 'gamepad';

export interface SlotAssignment {
  ready: boolean;
  /** Index into the connected-gamepads array (e.g. `scene.input.gamepad.getAll()`) - only set when `ready` and the slot actually wants a gamepad. */
  gamepadIndex: number | null;
}

/**
 * Per docs/controls.md: gamepad slots are claimed in slot order (P1 -> P2
 * -> P3 -> P4), not manually picked - a slot wanting a gamepad is "ready"
 * once enough controllers are connected to reach its position among the
 * gamepad-wanting slots. Keyboard slots are always ready. This is the
 * single source of truth for that assignment - both `MenuScene`'s READY/
 * WAITING cards and `GameScene`'s actual player construction read it, so
 * the menu can never promise a slot the round doesn't also deliver.
 */
export function computeSlotAssignments(
  sources: readonly InputSource[],
  connectedGamepadCount: number,
): SlotAssignment[] {
  let assigned = 0;
  return sources.map((source) => {
    if (source === 'keyboard') return { ready: true, gamepadIndex: null };
    const index = assigned;
    assigned += 1;
    const ready = index < connectedGamepadCount;
    return { ready, gamepadIndex: ready ? index : null };
  });
}

export function computeGamepadReadiness(
  sources: readonly InputSource[],
  connectedGamepadCount: number,
): boolean[] {
  return computeSlotAssignments(sources, connectedGamepadCount).map((assignment) => assignment.ready);
}
