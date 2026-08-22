export type InputSource = 'keyboard' | 'gamepad';

/**
 * Per docs/controls.md: gamepad slots are claimed in slot order (P1 -> P2
 * -> P3 -> P4), not manually picked - a slot wanting a gamepad is "ready"
 * once enough controllers are connected to reach its position among the
 * gamepad-wanting slots. Keyboard slots are always ready.
 */
export function computeGamepadReadiness(
  sources: readonly InputSource[],
  connectedGamepadCount: number,
): boolean[] {
  let assigned = 0;
  return sources.map((source) => {
    if (source === 'keyboard') return true;
    assigned += 1;
    return assigned <= connectedGamepadCount;
  });
}
