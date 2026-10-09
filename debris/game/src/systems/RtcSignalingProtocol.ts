/**
 * Pure WebRTC signaling wire format (docs/roadmap.md's "Windows + LAN
 * multiplayer," Sprint 5) - no RTCPeerConnection, no dgram, same "pure
 * rule logic gets extracted and unit-tested" convention as
 * `LanDiscoveryProtocol.ts`. Carried over the same LAN discovery
 * channel that announce packets use (`LanDiscovery.ts`'s
 * `window.debrisLan`), distinguished by `type` rather than a separate
 * port - one socket, two message shapes.
 *
 * `connectionId` exists because a host can have more than one join
 * attempt in flight at once (several players connecting within the
 * same second or so) - every message in one handshake carries the same
 * id, so the host can route an incoming ICE candidate to the right
 * in-progress `RtcConnection` rather than guessing.
 */

export type SignalKind = 'offer' | 'answer' | 'ice-candidate';

export interface SignalEnvelope {
  readonly type: 'debris-signal';
  readonly connectionId: string;
  readonly kind: SignalKind;
  /** JSON-serialized RTCSessionDescriptionInit (offer/answer) or RTCIceCandidateInit (ice-candidate) - kept as an opaque string here, same "this module doesn't know about WebRTC" boundary the file doc comment describes. */
  readonly payload: string;
}

export function encodeSignal(envelope: SignalEnvelope): string {
  return JSON.stringify(envelope);
}

/** Returns `undefined` for anything that isn't a well-formed `SignalEnvelope` - a malformed or foreign packet on the same port is silently ignored, not a crash, same convention `decodeAnnounce` already uses. */
export function decodeSignal(raw: string): SignalEnvelope | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const candidate = parsed as Record<string, unknown>;

  if (candidate.type !== 'debris-signal') return undefined;
  if (typeof candidate.connectionId !== 'string') return undefined;
  if (candidate.kind !== 'offer' && candidate.kind !== 'answer' && candidate.kind !== 'ice-candidate') {
    return undefined;
  }
  if (typeof candidate.payload !== 'string') return undefined;

  return {
    type: 'debris-signal',
    connectionId: candidate.connectionId,
    kind: candidate.kind,
    payload: candidate.payload,
  };
}
