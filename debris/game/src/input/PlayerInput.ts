/**
 * Common interface every input adapter implements, regardless of source
 * (keyboard zone or gamepad) - per docs/technical_design.md's "per-player
 * input adapters" decision, ship logic only ever talks to this shape and
 * never knows or cares what's behind it.
 */
export interface PlayerInput {
  readonly turnDirection: -1 | 0 | 1;
  readonly isThrusting: boolean;
  readonly isFiring: boolean;
  /** Optional - only adapters holding external resources (e.g. `KeyboardInput`'s window listeners) need one. `GamepadInput` just reads an already-owned `Gamepad` reference, nothing to release. */
  destroy?(): void;
}
