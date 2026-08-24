/**
 * "Both a stick and the D-pad are accepted for turning" (docs/controls.md)
 * - the D-pad wins when both disagree, since a digital press is
 * unambiguous while a stick can be mid-motion; the deadzone keeps a
 * resting stick (which rarely reports exactly 0) from registering as a
 * turn at all.
 */
export function computeGamepadTurnDirection(
  stickX: number,
  dpadLeftPressed: boolean,
  dpadRightPressed: boolean,
  deadzone: number,
): -1 | 0 | 1 {
  if (dpadLeftPressed && !dpadRightPressed) return -1;
  if (dpadRightPressed && !dpadLeftPressed) return 1;
  if (stickX <= -deadzone) return -1;
  if (stickX >= deadzone) return 1;
  return 0;
}
