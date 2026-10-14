import { HULL_IDS, type HullId } from '../config/GameConfig';

/**
 * Pure wire format for the one handshake message that travels over a
 * connection's *reliable* channel rather than the unreliable one
 * `NetworkSnapshotProtocol.ts`'s messages use (docs/roadmap.md's
 * "Windows + LAN multiplayer," Sprint 6/7) - a dropped slot assignment
 * would be a genuinely broken join, not a stale frame to just
 * supersede with the next one, so this one has to actually arrive.
 *
 * Sent host -> client once, right after `RtcConnection.onConnected`
 * fires - the host's own answer to "which player am I."
 */

export interface WelcomeMessage {
  readonly type: 'debris-welcome';
  readonly slotIndex: number;
  readonly mode: 'cooperative' | 'competitive';
  readonly hulls: readonly HullId[];
  /**
   * The host's own `LanDiscoveryProtocol.PROTOCOL_VERSION` (docs/
   * roadmap.md's "Windows + LAN multiplayer," Sprint 15's version-
   * gating) - not referenced by type here to keep this file free of a
   * dependency on that one, but a client compares it against its own
   * copy of the same constant and refuses to proceed into a mismatched
   * match rather than limping along against a `GameSnapshot` shape it
   * doesn't actually understand. A second line of defense: the LAN
   * discovery layer's own `decodeAnnounce` already filters a mismatched
   * host out of the join list before a connection is ever attempted -
   * this only matters for the rarer case one happens anyway.
   */
  readonly protocolVersion: number;
}

export function encodeWelcome(message: WelcomeMessage): string {
  return JSON.stringify(message);
}

export function decodeWelcome(raw: string): WelcomeMessage | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const candidate = parsed as Record<string, unknown>;

  if (candidate.type !== 'debris-welcome') return undefined;
  if (typeof candidate.slotIndex !== 'number') return undefined;
  if (candidate.mode !== 'cooperative' && candidate.mode !== 'competitive') return undefined;
  if (!Array.isArray(candidate.hulls) || !candidate.hulls.every((hull) => HULL_IDS.includes(hull as HullId))) {
    return undefined;
  }
  if (typeof candidate.protocolVersion !== 'number') return undefined;

  return {
    type: 'debris-welcome',
    slotIndex: candidate.slotIndex,
    mode: candidate.mode,
    hulls: candidate.hulls as HullId[],
    protocolVersion: candidate.protocolVersion,
  };
}

/**
 * Dedicated-server lobby messages (docs/roadmap.md's "Windows + LAN
 * multiplayer" - online phase 4). All three travel the *reliable*
 * channel: a lost "you're the leader now" or a swallowed START would be a
 * stuck lobby, not a stale frame.
 *
 * A dedicated server has no host player, so the lobby has a **leader**:
 * the earliest joiner still connected, passed on when they leave. Only the
 * leader's commands are honoured, and the server decides who sent a
 * command from the *connection* it arrived on - never from anything the
 * message itself claims.
 */

export type LobbyMode = 'cooperative' | 'competitive';

/** Server -> every client, whenever anything about the lobby changes (a join, a leave, a new leader, a mode change, a match starting or ending). Clients render the lobby from the latest one. */
export interface LobbyStateMessage {
  readonly type: 'debris-lobby';
  /** `inMatch` = a match is running and joiners are turned away; `lobby` = players are gathering. */
  readonly status: 'lobby' | 'inMatch';
  readonly mode: LobbyMode;
  readonly maxPlayers: number;
  /** Slot of the current leader, or -1 when nobody is connected. */
  readonly leaderSlot: number;
  /** Occupied slots in join order (the first is the leader, unless nobody is). */
  readonly slots: readonly number[];
  /** Slots whose player dropped mid-match and may still reconnect (online phase 5) - drawn as "reconnecting" rather than gone. Always empty outside a match. */
  readonly heldSlots: readonly number[];
}

/** Client -> server. Honoured only from the leader, and only while the lobby is gathering. */
export type LobbyCommandMessage =
  | { readonly type: 'debris-lobby-command'; readonly action: 'start' }
  | { readonly type: 'debris-lobby-command'; readonly action: 'setMode'; readonly mode: LobbyMode };

/** Server -> a connection it will not seat, sent right before it closes it. */
export type RejectReason = 'full' | 'matchInProgress' | 'badPassword' | 'wrongVersion' | 'badRequest';

const REJECT_REASONS: readonly RejectReason[] = ['full', 'matchInProgress', 'badPassword', 'wrongVersion', 'badRequest'];

export interface RejectMessage {
  readonly type: 'debris-reject';
  readonly reason: RejectReason;
}

function parseObject(raw: string): Record<string, unknown> | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : undefined;
}

const isMode = (value: unknown): value is LobbyMode => value === 'cooperative' || value === 'competitive';

export function encodeLobbyState(message: LobbyStateMessage): string {
  return JSON.stringify(message);
}

export function decodeLobbyState(raw: string): LobbyStateMessage | undefined {
  const c = parseObject(raw);
  if (!c || c.type !== 'debris-lobby') return undefined;
  if (c.status !== 'lobby' && c.status !== 'inMatch') return undefined;
  if (!isMode(c.mode)) return undefined;
  if (typeof c.maxPlayers !== 'number' || typeof c.leaderSlot !== 'number') return undefined;
  const isSlotList = (v: unknown): v is number[] => Array.isArray(v) && v.every((s) => Number.isInteger(s));
  if (!isSlotList(c.slots) || !isSlotList(c.heldSlots)) return undefined;
  return {
    type: 'debris-lobby',
    status: c.status,
    mode: c.mode,
    maxPlayers: c.maxPlayers,
    leaderSlot: c.leaderSlot,
    slots: c.slots,
    heldSlots: c.heldSlots,
  };
}

export function encodeLobbyCommand(message: LobbyCommandMessage): string {
  return JSON.stringify(message);
}

export function decodeLobbyCommand(raw: string): LobbyCommandMessage | undefined {
  const c = parseObject(raw);
  if (!c || c.type !== 'debris-lobby-command') return undefined;
  if (c.action === 'start') return { type: 'debris-lobby-command', action: 'start' };
  if (c.action === 'setMode' && isMode(c.mode)) {
    return { type: 'debris-lobby-command', action: 'setMode', mode: c.mode };
  }
  return undefined;
}

export function encodeReject(message: RejectMessage): string {
  return JSON.stringify(message);
}

export function decodeReject(raw: string): RejectMessage | undefined {
  const c = parseObject(raw);
  if (!c || c.type !== 'debris-reject') return undefined;
  if (!REJECT_REASONS.includes(c.reason as RejectReason)) return undefined;
  return { type: 'debris-reject', reason: c.reason as RejectReason };
}
