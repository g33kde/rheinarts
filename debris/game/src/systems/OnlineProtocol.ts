import { HULL_IDS, type HullId } from '../config/GameConfig';
import type { LobbyMode } from './NetworkHandshakeProtocol';

/**
 * Wire format for joining a dedicated server (docs/roadmap.md's "Windows +
 * LAN multiplayer" - online phase 5). Pure, like every protocol module
 * here: no sockets, no Phaser.
 *
 * Two different channels carry these:
 * - **`debris-join` / `debris-joined`** travel the WebRTC *reliable*
 *   channel, after the connection is up. The server seats nobody until it
 *   has received a join - it is the one place the password, the protocol
 *   version, the number of local players and a reconnect token are checked.
 * - **`debris-status` / `debris-status-reply`** travel the *signaling
 *   WebSocket* alone, with no WebRTC at all, so the Online screen can show
 *   "who is on, is it full, is it the right version" cheaply and often.
 *
 * Nothing here is encrypted (the signaling socket is plain `ws://` for now),
 * so the password and token are only as private as the network path.
 */

export const MAX_PASSWORD_LENGTH = 64;
export const TOKEN_LENGTH = 32;

/** Client -> server, first thing on the reliable channel. */
export interface JoinMessage {
  readonly type: 'debris-join';
  readonly protocolVersion: number;
  /** Empty when the server has none. Compared on the server only; never echoed back. */
  readonly password: string;
  /** How many players are on this PC (1 or 2): they take consecutive-ish slots and share the connection. */
  readonly localPlayers: 1 | 2;
  /** The token from a previous `debris-joined`, to take back a seat held after a drop. */
  readonly token?: string;
}

/** Server -> client, the answer to a successful join. (A failed one gets a `debris-reject` instead.) */
export interface JoinedMessage {
  readonly type: 'debris-joined';
  readonly protocolVersion: number;
  /** The slots this connection controls, in the order its local players were requested. */
  readonly slotIndices: readonly number[];
  /** Present this in a later `debris-join` to reclaim these seats after a drop. Keep it secret. */
  readonly token: string;
  readonly mode: LobbyMode;
  readonly hulls: readonly HullId[];
  /** True when this join took back a held seat (rather than seating someone new). */
  readonly resumed: boolean;
  /** True when a match is running right now - only ever true for a resumed join. The client should go straight into it. */
  readonly inMatch: boolean;
  readonly serverName: string;
  readonly motd: string;
}

/** Client -> server over the signaling socket. */
export interface StatusRequest {
  readonly type: 'debris-status';
}

/** Server -> client over the signaling socket. */
export interface StatusReply {
  readonly type: 'debris-status-reply';
  readonly protocolVersion: number;
  readonly name: string;
  readonly motd: string;
  readonly passwordRequired: boolean;
  readonly status: 'lobby' | 'inMatch';
  readonly mode: LobbyMode;
  readonly players: { readonly current: number; readonly max: number };
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

const isMode = (v: unknown): v is LobbyMode => v === 'cooperative' || v === 'competitive';
const isNonNegInt = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
export const isValidToken = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]+$/.test(v) && v.length === TOKEN_LENGTH;

export function encodeJoin(message: JoinMessage): string {
  return JSON.stringify(message);
}

/** Strict: a join that is malformed in any way is `undefined`, and the server answers it with `badRequest` rather than guessing. Extra fields are dropped. */
export function decodeJoin(raw: string): JoinMessage | undefined {
  const c = parseObject(raw);
  if (!c || c.type !== 'debris-join') return undefined;
  if (typeof c.protocolVersion !== 'number') return undefined;
  if (typeof c.password !== 'string' || c.password.length > MAX_PASSWORD_LENGTH) return undefined;
  if (c.localPlayers !== 1 && c.localPlayers !== 2) return undefined;
  if (c.token !== undefined && !isValidToken(c.token)) return undefined;
  return {
    type: 'debris-join',
    protocolVersion: c.protocolVersion,
    password: c.password,
    localPlayers: c.localPlayers,
    ...(c.token !== undefined ? { token: c.token } : {}),
  };
}

export function encodeJoined(message: JoinedMessage): string {
  return JSON.stringify(message);
}

export function decodeJoined(raw: string): JoinedMessage | undefined {
  const c = parseObject(raw);
  if (!c || c.type !== 'debris-joined') return undefined;
  if (typeof c.protocolVersion !== 'number') return undefined;
  if (!Array.isArray(c.slotIndices) || c.slotIndices.length < 1 || c.slotIndices.length > 2 || !c.slotIndices.every(isNonNegInt)) return undefined;
  if (!isValidToken(c.token)) return undefined;
  if (!isMode(c.mode)) return undefined;
  if (!Array.isArray(c.hulls) || !c.hulls.every((h) => HULL_IDS.includes(h as HullId))) return undefined;
  if (typeof c.resumed !== 'boolean' || typeof c.inMatch !== 'boolean') return undefined;
  if (typeof c.serverName !== 'string' || typeof c.motd !== 'string') return undefined;
  return {
    type: 'debris-joined',
    protocolVersion: c.protocolVersion,
    slotIndices: c.slotIndices as number[],
    token: c.token,
    mode: c.mode,
    hulls: c.hulls as HullId[],
    resumed: c.resumed,
    inMatch: c.inMatch,
    serverName: c.serverName,
    motd: c.motd,
  };
}

export function encodeStatusRequest(): string {
  return JSON.stringify({ type: 'debris-status' } satisfies StatusRequest);
}

export function isStatusRequest(raw: string): boolean {
  return parseObject(raw)?.type === 'debris-status';
}

export function encodeStatusReply(message: StatusReply): string {
  return JSON.stringify(message);
}

export function decodeStatusReply(raw: string): StatusReply | undefined {
  const c = parseObject(raw);
  if (!c || c.type !== 'debris-status-reply') return undefined;
  if (typeof c.protocolVersion !== 'number') return undefined;
  if (typeof c.name !== 'string' || typeof c.motd !== 'string') return undefined;
  if (typeof c.passwordRequired !== 'boolean') return undefined;
  if (c.status !== 'lobby' && c.status !== 'inMatch') return undefined;
  if (!isMode(c.mode)) return undefined;
  const players = c.players as Record<string, unknown> | null;
  if (typeof players !== 'object' || players === null || !isNonNegInt(players.current) || !isNonNegInt(players.max)) return undefined;
  return {
    type: 'debris-status-reply',
    protocolVersion: c.protocolVersion,
    name: c.name,
    motd: c.motd,
    passwordRequired: c.passwordRequired,
    status: c.status,
    mode: c.mode,
    players: { current: players.current, max: players.max },
  };
}
