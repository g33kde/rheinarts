import { describe, expect, it } from 'vitest';
import {
  decodeAnnounce,
  encodeAnnounce,
  isStale,
  PROTOCOL_VERSION,
  pruneStaleGames,
  upsertDiscoveredGame,
  type AnnouncePacket,
} from '../src/systems/LanDiscoveryProtocol';

const PACKET: AnnouncePacket = {
  type: 'debris-announce',
  protocolVersion: PROTOCOL_VERSION,
  hostName: "Mas's Game",
  mode: 'cooperative',
  players: { current: 1, max: 4 },
  signalPort: 47322,
};

describe('encodeAnnounce / decodeAnnounce', () => {
  it('round-trips a well-formed packet', () => {
    expect(decodeAnnounce(encodeAnnounce(PACKET))).toEqual(PACKET);
  });

  it('rejects garbage input instead of throwing', () => {
    expect(decodeAnnounce('not json')).toBeUndefined();
    expect(decodeAnnounce('{}')).toBeUndefined();
    expect(decodeAnnounce('null')).toBeUndefined();
    expect(decodeAnnounce('42')).toBeUndefined();
  });

  it('rejects a packet of the wrong type', () => {
    expect(decodeAnnounce(JSON.stringify({ ...PACKET, type: 'something-else' }))).toBeUndefined();
  });

  it('rejects a mismatched protocol version', () => {
    expect(decodeAnnounce(JSON.stringify({ ...PACKET, protocolVersion: PROTOCOL_VERSION + 1 }))).toBeUndefined();
  });

  it('rejects an invalid mode', () => {
    expect(decodeAnnounce(JSON.stringify({ ...PACKET, mode: 'single-player' }))).toBeUndefined();
  });

  it('rejects a missing/malformed players field', () => {
    expect(decodeAnnounce(JSON.stringify({ ...PACKET, players: undefined }))).toBeUndefined();
    expect(decodeAnnounce(JSON.stringify({ ...PACKET, players: { current: '1', max: 4 } }))).toBeUndefined();
  });
});

describe('isStale', () => {
  it('is false just under the timeout', () => {
    expect(isStale(1000, 1000 + 2999, 3000)).toBe(false);
  });

  it('is true once the timeout has passed', () => {
    expect(isStale(1000, 1000 + 3001, 3000)).toBe(true);
  });
});

describe('upsertDiscoveredGame', () => {
  it('adds a new entry for a never-seen address', () => {
    const result = upsertDiscoveredGame([], '192.168.1.10', PACKET, 1000);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ address: '192.168.1.10', packet: PACKET, lastSeenMs: 1000 });
  });

  it('replaces the existing entry for an already-known address rather than duplicating it', () => {
    const first = upsertDiscoveredGame([], '192.168.1.10', PACKET, 1000);
    const updatedPacket: AnnouncePacket = { ...PACKET, players: { current: 2, max: 4 } };
    const second = upsertDiscoveredGame(first, '192.168.1.10', updatedPacket, 2000);
    expect(second).toHaveLength(1);
    expect(second[0]).toEqual({ address: '192.168.1.10', packet: updatedPacket, lastSeenMs: 2000 });
  });

  it('keeps separate entries for separate addresses', () => {
    const first = upsertDiscoveredGame([], '192.168.1.10', PACKET, 1000);
    const second = upsertDiscoveredGame(first, '192.168.1.11', PACKET, 1000);
    expect(second).toHaveLength(2);
  });
});

describe('pruneStaleGames', () => {
  it('drops games past the stale timeout and keeps the rest', () => {
    const games = [
      { address: '192.168.1.10', packet: PACKET, lastSeenMs: 1000 },
      { address: '192.168.1.11', packet: PACKET, lastSeenMs: 4000 },
    ];
    const result = pruneStaleGames(games, 5000, 3000);
    expect(result).toHaveLength(1);
    expect(result[0]?.address).toBe('192.168.1.11');
  });
});
