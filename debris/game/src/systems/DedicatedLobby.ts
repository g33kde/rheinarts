import type { LobbyMode, LobbyStateMessage } from './NetworkHandshakeProtocol';

/**
 * The dedicated server's lobby rules as a pure state machine (docs/
 * roadmap.md's "Windows + LAN multiplayer" - online phase 4), so the
 * authority questions - who may start, who may change the mode, who leads
 * after the leader leaves, who gets turned away - are unit-tested without
 * a network or a Phaser scene. `DedicatedServer.ts` is the thin glue that
 * feeds it real connections.
 *
 * Players are identified by their slot only; mapping a connection to its
 * slot is the glue's job (and is what makes a command unforgeable: the
 * slot comes from the connection it arrived on, never from the message).
 */

export type JoinResult =
  | { readonly ok: true; readonly slotIndex: number }
  | { readonly ok: false; readonly reason: 'full' | 'matchInProgress' };

export type CommandResult = 'started' | 'modeChanged' | 'ignored';

export class DedicatedLobby {
  private members: number[] = []; // slots, in join order
  private status: 'lobby' | 'inMatch' = 'lobby';
  private mode: LobbyMode;

  constructor(
    private readonly maxPlayers: number,
    private readonly defaultMode: LobbyMode,
  ) {
    this.mode = defaultMode;
  }

  get currentMode(): LobbyMode {
    return this.mode;
  }

  get isInMatch(): boolean {
    return this.status === 'inMatch';
  }

  get memberSlots(): readonly number[] {
    return this.members;
  }

  /** The earliest joiner still connected, or -1. */
  get leaderSlot(): number {
    return this.members[0] ?? -1;
  }

  /** Seats a new player in the lowest free slot - unless a match is running or the lobby is full. */
  join(): JoinResult {
    if (this.status === 'inMatch') return { ok: false, reason: 'matchInProgress' };
    for (let slot = 0; slot < this.maxPlayers; slot += 1) {
      if (!this.members.includes(slot)) {
        this.members.push(slot);
        return { ok: true, slotIndex: slot };
      }
    }
    return { ok: false, reason: 'full' };
  }

  /** Removes a player. Leadership passes to the next-earliest joiner automatically; an emptied lobby forgets the leader's mode choice. */
  leave(slotIndex: number): void {
    this.members = this.members.filter((slot) => slot !== slotIndex);
    if (this.members.length === 0 && this.status === 'lobby') this.mode = this.defaultMode;
  }

  /** A player's command. Only the leader's count, and only while the lobby is gathering. */
  command(
    fromSlot: number,
    command: { readonly action: 'start' } | { readonly action: 'setMode'; readonly mode: LobbyMode },
  ): CommandResult {
    if (this.status !== 'lobby' || fromSlot !== this.leaderSlot) return 'ignored';
    if (command.action === 'setMode') {
      if (command.mode === this.mode) return 'ignored';
      this.mode = command.mode;
      return 'modeChanged';
    }
    if (this.members.length === 0) return 'ignored';
    // Competitive is last-ship-standing: with one player it would end the
    // instant it began (`RoundOutcome.ts` calls a lone survivor the winner).
    if (this.mode === 'competitive' && this.members.length < 2) return 'ignored';
    this.status = 'inMatch';
    return 'started';
  }

  /** The match is over: back to gathering. Whoever is still connected stays seated, leader included. An empty lobby resets to the default mode. */
  endMatch(): void {
    this.status = 'lobby';
    if (this.members.length === 0) this.mode = this.defaultMode;
  }

  snapshot(): LobbyStateMessage {
    return {
      type: 'debris-lobby',
      status: this.status,
      mode: this.mode,
      maxPlayers: this.maxPlayers,
      leaderSlot: this.leaderSlot,
      slots: [...this.members],
    };
  }
}
