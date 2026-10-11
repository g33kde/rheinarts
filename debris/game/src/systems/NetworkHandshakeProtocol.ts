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
