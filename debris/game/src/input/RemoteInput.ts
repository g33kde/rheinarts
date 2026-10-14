import type { InputMessage } from '../systems/NetworkSnapshotProtocol';
import type { PlayerInput } from './PlayerInput';

/**
 * The host's own stand-in for a networked player's input (docs/roadmap.md's
 * "Windows + LAN multiplayer," Sprint 6) - same "dumb mutable holder"
 * shape `AiInput.ts` already uses, for the same reason: ship logic only
 * ever talks to `PlayerInput`, never a concrete adapter, so a slot
 * driven by a remote client's own keyboard/gamepad looks exactly like a
 * local one from GameScene's point of view.
 *
 * GameScene writes to this whenever an `InputMessage`
 * (`NetworkSnapshotProtocol.ts`) arrives for this slot over the
 * network; nothing here decides anything on its own.
 */
export class RemoteInput implements PlayerInput {
  turnDirection: -1 | 0 | 1 = 0;
  isThrusting = false;
  isFiring = false;
  isHyperspacing = false;

  /** Back to neutral - a dropped player's ship must not keep thrusting or firing on the last message that arrived. */
  reset(): void {
    this.turnDirection = 0;
    this.isThrusting = false;
    this.isFiring = false;
    this.isHyperspacing = false;
  }

  /** Called by `NetworkHostSession`'s own onClientInput callback whenever a fresh `InputMessage` arrives for this slot - the only thing that ever writes to this class's fields. */
  applyMessage(message: InputMessage): void {
    this.turnDirection = message.turnDirection;
    this.isThrusting = message.isThrusting;
    this.isFiring = message.isFiring;
    this.isHyperspacing = message.isHyperspacing;
  }
}
