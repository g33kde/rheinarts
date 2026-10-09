import { describe, expect, it } from 'vitest';
import { decodeSignal, encodeSignal, type SignalEnvelope } from '../src/systems/RtcSignalingProtocol';

const ENVELOPE: SignalEnvelope = {
  type: 'debris-signal',
  connectionId: 'abc123',
  kind: 'offer',
  payload: JSON.stringify({ type: 'offer', sdp: 'v=0...' }),
};

describe('encodeSignal / decodeSignal', () => {
  it('round-trips a well-formed envelope', () => {
    expect(decodeSignal(encodeSignal(ENVELOPE))).toEqual(ENVELOPE);
  });

  it('round-trips every signal kind', () => {
    for (const kind of ['offer', 'answer', 'ice-candidate'] as const) {
      const envelope = { ...ENVELOPE, kind };
      expect(decodeSignal(encodeSignal(envelope))).toEqual(envelope);
    }
  });

  it('rejects garbage input instead of throwing', () => {
    expect(decodeSignal('not json')).toBeUndefined();
    expect(decodeSignal('{}')).toBeUndefined();
    expect(decodeSignal('null')).toBeUndefined();
  });

  it('rejects a packet of the wrong type (e.g. an announce packet on the same channel)', () => {
    expect(decodeSignal(JSON.stringify({ ...ENVELOPE, type: 'debris-announce' }))).toBeUndefined();
  });

  it('rejects an invalid kind', () => {
    expect(decodeSignal(JSON.stringify({ ...ENVELOPE, kind: 'something-else' }))).toBeUndefined();
  });

  it('rejects a missing connectionId or payload', () => {
    expect(decodeSignal(JSON.stringify({ ...ENVELOPE, connectionId: undefined }))).toBeUndefined();
    expect(decodeSignal(JSON.stringify({ ...ENVELOPE, payload: 42 }))).toBeUndefined();
  });
});
