import { describe, expect, it } from 'vitest';
import { decodeWelcome, encodeWelcome, type WelcomeMessage } from '../src/systems/NetworkHandshakeProtocol';

const WELCOME: WelcomeMessage = {
  type: 'debris-welcome',
  slotIndex: 1,
  mode: 'cooperative',
  hulls: ['interceptor', 'gunship', 'rescue', 'interceptor'],
  protocolVersion: 2,
};

describe('encodeWelcome / decodeWelcome', () => {
  it('round-trips a well-formed message', () => {
    expect(decodeWelcome(encodeWelcome(WELCOME))).toEqual(WELCOME);
  });

  it('rejects garbage input instead of throwing', () => {
    expect(decodeWelcome('not json')).toBeUndefined();
    expect(decodeWelcome('{}')).toBeUndefined();
    expect(decodeWelcome('null')).toBeUndefined();
  });

  it('rejects the wrong message type', () => {
    expect(decodeWelcome(JSON.stringify({ ...WELCOME, type: 'debris-signal' }))).toBeUndefined();
  });

  it('rejects an invalid mode', () => {
    expect(decodeWelcome(JSON.stringify({ ...WELCOME, mode: 'singlePlayer' }))).toBeUndefined();
  });

  it('rejects an unknown hull id', () => {
    expect(decodeWelcome(JSON.stringify({ ...WELCOME, hulls: ['interceptor', 'not-a-hull'] }))).toBeUndefined();
  });

  it('rejects a non-array hulls field', () => {
    expect(decodeWelcome(JSON.stringify({ ...WELCOME, hulls: 'interceptor' }))).toBeUndefined();
  });

  it('rejects a non-numeric protocolVersion', () => {
    expect(decodeWelcome(JSON.stringify({ ...WELCOME, protocolVersion: '2' }))).toBeUndefined();
  });

  it('rejects a message missing protocolVersion entirely', () => {
    const withoutVersion: Record<string, unknown> = { ...WELCOME };
    delete withoutVersion.protocolVersion;
    expect(decodeWelcome(JSON.stringify(withoutVersion))).toBeUndefined();
  });
});
