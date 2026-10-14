import type { LobbyMode } from './NetworkHandshakeProtocol';

/**
 * What a dedicated server's `GameScene` reports when a match ends, and how
 * it is told to behave (docs/roadmap.md's "Windows + LAN multiplayer" -
 * online phase 4). Types only, so `GameScene` and `DedicatedServer` can
 * share them without importing each other.
 */

export interface MatchResult {
  readonly mode: LobbyMode;
  readonly outcome: 'win' | 'draw' | 'loss';
  /** Slot of the winner, only for a Competitive `win`. */
  readonly winnerSlot: number | null;
  /** Final score per slot (always 4 entries; unseated slots are 0). */
  readonly scores: readonly number[];
  /** Cooperative's pooled team score, the one number that mode ranks on. */
  readonly pooledScore: number;
  /** Slots that were seated when the match started. */
  readonly participants: readonly number[];
}

/**
 * What the server can do to a running match: freeze a dropped player's ship
 * in place of eliminating it at once (online phase 5's reconnect window),
 * bring it back, or give up on it.
 */
export interface DedicatedMatchControl {
  /** `false`: the player's connection dropped - their ship goes inert and untouchable. `true`: they are back. */
  setSlotConnected(slotIndex: number, connected: boolean): void;
  /** The grace period ran out: eliminate the slot exactly as a permanent disconnect always did. */
  eliminateSlot(slotIndex: number): void;
}

/** Passed to `GameScene` instead of a local player: it reports the result here, after showing the end screen for `returnToLobbyDelayMs`, rather than waiting for a keypress nobody is there to press. */
export interface DedicatedMatchHooks {
  readonly returnToLobbyDelayMs: number;
  readonly onMatchEnded: (result: MatchResult) => void;
  /** Called once the match's players exist, with the handle the server uses for the reconnect window. `GameScene` does not watch connections itself when running dedicated - the server owns that. */
  readonly onReady: (control: DedicatedMatchControl) => void;
}
