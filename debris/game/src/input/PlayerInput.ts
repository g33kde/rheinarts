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
  /**
   * Hyperspace - the panic teleport (docs/controls.md, `HYPERSPACE` in
   * GameConfig.ts). Reported as a held level, not an edge, exactly like
   * `isFiring` above: adapters stay dumb and GameScene owns both the
   * rising-edge check and the cooldown, same as it already does for
   * firing.
   */
  readonly isHyperspacing: boolean;
  /** Optional - only adapters holding external resources (e.g. `KeyboardInput`'s window listeners) need one. `GamepadInput` just reads an already-owned `Gamepad` reference, nothing to release. */
  destroy?(): void;
}
