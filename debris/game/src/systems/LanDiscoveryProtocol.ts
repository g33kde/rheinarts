/**
 * Pure LAN discovery wire format (docs/roadmap.md's "Windows + LAN
 * multiplayer," Sprint 4) - no dgram, no Electron, same "pure rule
 * logic gets extracted and unit-tested" convention as
 * `BlackHoleGravity.ts`/`SaboteurAI.ts`. The actual UDP broadcast/listen
 * socket work lives in `desktop/main.js` (Node-only - a browser page,
 * including this game's own renderer, can't open a raw UDP socket at
 * all), which is integration glue this module deliberately knows
 * nothing about.
 *
 * A host (a player's own client, or the future dedicated server)
 * periodically broadcasts an `AnnouncePacket`; everyone else listens
 * and keeps a `DiscoveredGame` per host address, pruning any that stop
 * announcing - no explicit "I'm leaving" message, since a crashed host
 * can't send one either way.
 */

/**
 * Bumped to 2 for docs/roadmap.md's "Windows + LAN multiplayer," Sprint
 * 8-14 work - the wire format changed substantially since this was last
 * 1 (ships-only `GameSnapshot` grew entities/players/state/overlayLines/
 * shop). `decodeAnnounce` below already silently drops a mismatched
 * announce, so a stale build simply never appears in another build's
 * join list; `NetworkHandshakeProtocol.ts`'s own `WelcomeMessage` carries
 * this same number as a second check for the rarer case a connection
 * happens anyway (Sprint 15's version-gating).
 *
 * Bumped to 3 for the dedicated server's lobby (online phase 4): new
 * reliable-channel messages (`debris-lobby`, `debris-lobby-command`,
 * `debris-reject`) that an older client would not understand.
 *
 * Bumped to 5 for online phase 6: a join now carries the players' initials
 * (the server posts their scores to the online leaderboard).
 *
 * Bumped to 4 for online phase 5: clients now open with `debris-join`
 * (password, local player count, reconnect token), the server answers with
 * `debris-joined`, and the lobby state carries `heldSlots`.
 */
export const PROTOCOL_VERSION = 5;

export interface AnnouncePacket {
  readonly type: 'debris-announce';
  readonly protocolVersion: number;
  readonly hostName: string;
  readonly mode: 'cooperative' | 'competitive';
  readonly players: { readonly current: number; readonly max: number };
  /** The port this host listens on for join/signaling requests - see RtcTransport.ts (Sprint 5). */
  readonly signalPort: number;
}

export interface DiscoveredGame {
  readonly address: string;
  readonly packet: AnnouncePacket;
  readonly lastSeenMs: number;
}

export function encodeAnnounce(packet: AnnouncePacket): string {
  return JSON.stringify(packet);
}

/**
 * Returns `undefined` for anything that isn't a well-formed
 * `AnnouncePacket` - a malformed or foreign broadcast on the same port
 * (or a future protocol version this client doesn't understand) is
 * silently ignored, not a crash.
 */
export function decodeAnnounce(raw: string): AnnouncePacket | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const candidate = parsed as Record<string, unknown>;

  if (candidate.type !== 'debris-announce') return undefined;
  if (candidate.protocolVersion !== PROTOCOL_VERSION) return undefined;
  if (typeof candidate.hostName !== 'string') return undefined;
  if (candidate.mode !== 'cooperative' && candidate.mode !== 'competitive') return undefined;
  if (typeof candidate.signalPort !== 'number') return undefined;

  const players = candidate.players as Record<string, unknown> | undefined;
  if (typeof players !== 'object' || players === null) return undefined;
  if (typeof players.current !== 'number' || typeof players.max !== 'number') return undefined;

  return {
    type: 'debris-announce',
    protocolVersion: candidate.protocolVersion,
    hostName: candidate.hostName,
    mode: candidate.mode,
    players: { current: players.current, max: players.max },
    signalPort: candidate.signalPort,
  };
}

/** A game is stale (its host has gone quiet - closed, crashed, or just out of broadcast range) once nothing's been heard from it for `timeoutMs`. */
export function isStale(lastSeenMs: number, nowMs: number, timeoutMs: number): boolean {
  return nowMs - lastSeenMs > timeoutMs;
}

/**
 * Folds one freshly-received announce into the existing discovered-games
 * list - updates the entry for that address if one exists, adds a new
 * one otherwise. Pure (returns a new array) so the caller's own list
 * stays the single source of truth, same spirit as everywhere else in
 * this codebase that threads state through rather than mutating a
 * shared object.
 */
export function upsertDiscoveredGame(
  games: readonly DiscoveredGame[],
  address: string,
  packet: AnnouncePacket,
  nowMs: number,
): DiscoveredGame[] {
  const next = games.filter((game) => game.address !== address);
  next.push({ address, packet, lastSeenMs: nowMs });
  return next;
}

/** Drops every game that's gone stale - called on a timer, not per-announce, so a host that simply stops broadcasting eventually disappears from the list instead of lingering forever. */
export function pruneStaleGames(
  games: readonly DiscoveredGame[],
  nowMs: number,
  timeoutMs: number,
): DiscoveredGame[] {
  return games.filter((game) => !isStale(game.lastSeenMs, nowMs, timeoutMs));
}
