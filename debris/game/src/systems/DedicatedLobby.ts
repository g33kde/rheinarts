import type { LobbyMode, LobbyStateMessage } from './NetworkHandshakeProtocol';

/**
 * The dedicated server's lobby rules as a pure state machine (docs/
 * roadmap.md's "Windows + LAN multiplayer" - online phases 4-5), so the
 * authority questions - who may start, who may change the mode, who leads
 * after the leader leaves, who gets turned away - are unit-tested without
 * a network or a Phaser scene. `DedicatedServer.ts` is the thin glue that
 * feeds it real connections.
 *
 * The unit here is an **owner**: one connection (one PC), which seats one
 * or two local players. Owners are opaque numbers the glue hands out;
 * mapping a connection to its owner is the glue's job, and is what makes a
 * command unforgeable (the owner comes from the connection a message
 * arrived on, never from the message). Leadership belongs to the owner, so
 * a PC with two players is one leader, not two.
 */

export type JoinResult =
  | { readonly ok: true; readonly slots: readonly number[] }
  | { readonly ok: false; readonly reason: 'full' | 'matchInProgress' };

export type CommandResult = 'started' | 'modeChanged' | 'ignored';

interface Member {
  readonly owner: number;
  readonly slots: readonly number[];
}

export class DedicatedLobby {
  private members: Member[] = []; // in join order
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

  /** Every seated slot, in join order (an owner's own slots stay together). */
  get memberSlots(): readonly number[] {
    return this.members.flatMap((member) => member.slots);
  }

  get playerCount(): number {
    return this.memberSlots.length;
  }

  /** The earliest joiner still seated, or -1. */
  get leaderOwner(): number {
    return this.members[0]?.owner ?? -1;
  }

  /** The leader's first slot, or -1 - what a client compares against its own slots. */
  get leaderSlot(): number {
    return this.members[0]?.slots[0] ?? -1;
  }

  slotsOf(owner: number): readonly number[] {
    return this.members.find((member) => member.owner === owner)?.slots ?? [];
  }

  /**
   * Seats `owner` with `count` local players in the lowest free slots,
   * all-or-nothing: a PC that wants two players and finds one slot free is
   * turned away as `full`, not seated half-way. Never while a match runs
   * (a returning player is resumed by the glue, not re-seated here).
   */
  join(owner: number, count: 1 | 2): JoinResult {
    if (this.status === 'inMatch') return { ok: false, reason: 'matchInProgress' };
    if (this.members.some((member) => member.owner === owner)) {
      return { ok: true, slots: this.slotsOf(owner) }; // already seated: idempotent
    }
    const taken = new Set(this.memberSlots);
    const slots: number[] = [];
    for (let slot = 0; slot < this.maxPlayers && slots.length < count; slot += 1) {
      if (!taken.has(slot)) slots.push(slot);
    }
    if (slots.length < count) return { ok: false, reason: 'full' };
    this.members.push({ owner, slots });
    return { ok: true, slots };
  }

  /** Removes an owner and all their slots. Leadership passes to the next-earliest joiner automatically; an emptied lobby forgets the leader's mode choice. */
  leave(owner: number): void {
    this.members = this.members.filter((member) => member.owner !== owner);
    if (this.members.length === 0 && this.status === 'lobby') this.mode = this.defaultMode;
  }

  /** An owner's command. Only the leader's count, and only while the lobby is gathering. */
  command(
    owner: number,
    command: { readonly action: 'start' } | { readonly action: 'setMode'; readonly mode: LobbyMode },
  ): CommandResult {
    if (this.status !== 'lobby' || owner !== this.leaderOwner) return 'ignored';
    if (command.action === 'setMode') {
      if (command.mode === this.mode) return 'ignored';
      this.mode = command.mode;
      return 'modeChanged';
    }
    // Competitive is last-ship-standing: with one player it would end the
    // instant it began (`RoundOutcome.ts` calls a lone survivor the winner).
    // Two players on one PC count as two.
    if (this.mode === 'competitive' && this.playerCount < 2) return 'ignored';
    this.status = 'inMatch';
    return 'started';
  }

  /** The match is over: back to gathering. Whoever is still seated stays seated, leader included. An empty lobby resets to the default mode. */
  endMatch(): void {
    this.status = 'lobby';
    if (this.members.length === 0) this.mode = this.defaultMode;
  }

  snapshot(heldSlots: readonly number[] = []): LobbyStateMessage {
    return {
      type: 'debris-lobby',
      status: this.status,
      mode: this.mode,
      maxPlayers: this.maxPlayers,
      leaderSlot: this.leaderSlot,
      slots: [...this.memberSlots],
      heldSlots: [...heldSlots],
    };
  }
}
