import { describe, expect, it } from 'vitest';
import {
  decodeJoin,
  decodeJoined,
  decodeStatusReply,
  encodeJoin,
  encodeJoined,
  encodeStatusReply,
  encodeStatusRequest,
  isStatusRequest,
  isValidToken,
  MAX_PASSWORD_LENGTH,
  type JoinedMessage,
  type StatusReply,
} from '../src/systems/OnlineProtocol';

const TOKEN = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

const JOINED: JoinedMessage = {
  type: 'debris-joined',
  protocolVersion: 4,
  slotIndices: [1, 3],
  token: TOKEN,
  mode: 'cooperative',
  hulls: ['interceptor', 'gunship', 'rescue', 'interceptor'],
  resumed: false,
  inMatch: false,
  serverName: 'Debris Server',
  motd: 'Welcome',
};

const STATUS: StatusReply = {
  type: 'debris-status-reply',
  protocolVersion: 4,
  name: 'Debris Server',
  motd: 'Hi',
  passwordRequired: true,
  status: 'lobby',
  mode: 'competitive',
  players: { current: 2, max: 4 },
};

describe('token', () => {
  it('is 32 lowercase hex characters', () => {
    expect(isValidToken(TOKEN)).toBe(true);
    expect(isValidToken(TOKEN.toUpperCase())).toBe(false);
    expect(isValidToken(TOKEN.slice(1))).toBe(false);
    expect(isValidToken(`${TOKEN}0`)).toBe(false);
    expect(isValidToken('g'.repeat(32))).toBe(false);
    expect(isValidToken(42)).toBe(false);
  });
});

describe('join', () => {
  const join = { type: 'debris-join', protocolVersion: 4, password: 'pw', localPlayers: 2 } as const;

  it('round-trips with and without a token', () => {
    expect(decodeJoin(encodeJoin(join))).toEqual(join);
    expect(decodeJoin(encodeJoin({ ...join, token: TOKEN }))).toEqual({ ...join, token: TOKEN });
  });

  it('accepts an empty password (a server with none)', () => {
    expect(decodeJoin(encodeJoin({ ...join, password: '' }))?.password).toBe('');
  });

  it('drops extra fields', () => {
    const raw = JSON.stringify({ ...join, admin: true, slotIndex: 0 });
    expect(decodeJoin(raw)).toEqual(join);
  });

  it('is strict about everything else', () => {
    expect(decodeJoin('nope')).toBeUndefined();
    expect(decodeJoin('[]')).toBeUndefined();
    expect(decodeJoin(JSON.stringify({ ...join, localPlayers: 3 }))).toBeUndefined();
    expect(decodeJoin(JSON.stringify({ ...join, localPlayers: 0 }))).toBeUndefined();
    expect(decodeJoin(JSON.stringify({ ...join, localPlayers: '1' }))).toBeUndefined();
    expect(decodeJoin(JSON.stringify({ ...join, password: 12 }))).toBeUndefined();
    expect(decodeJoin(JSON.stringify({ ...join, password: 'x'.repeat(MAX_PASSWORD_LENGTH + 1) }))).toBeUndefined();
    expect(decodeJoin(JSON.stringify({ ...join, protocolVersion: '4' }))).toBeUndefined();
    expect(decodeJoin(JSON.stringify({ ...join, token: 'short' }))).toBeUndefined();
    expect(decodeJoin(JSON.stringify({ ...join, type: 'debris-joined' }))).toBeUndefined();
  });
});

describe('joined', () => {
  it('round-trips', () => {
    expect(decodeJoined(encodeJoined(JOINED))).toEqual(JOINED);
  });

  it('rejects malformed messages', () => {
    expect(decodeJoined('x')).toBeUndefined();
    expect(decodeJoined(JSON.stringify({ ...JOINED, slotIndices: [] }))).toBeUndefined();
    expect(decodeJoined(JSON.stringify({ ...JOINED, slotIndices: [0, 1, 2] }))).toBeUndefined();
    expect(decodeJoined(JSON.stringify({ ...JOINED, slotIndices: [-1] }))).toBeUndefined();
    expect(decodeJoined(JSON.stringify({ ...JOINED, token: 'nope' }))).toBeUndefined();
    expect(decodeJoined(JSON.stringify({ ...JOINED, mode: 'singlePlayer' }))).toBeUndefined();
    expect(decodeJoined(JSON.stringify({ ...JOINED, hulls: ['battleship'] }))).toBeUndefined();
    expect(decodeJoined(JSON.stringify({ ...JOINED, resumed: 'no' }))).toBeUndefined();
    expect(decodeJoined(JSON.stringify({ ...JOINED, motd: null }))).toBeUndefined();
  });
});

describe('status', () => {
  it('recognises a request and nothing else', () => {
    expect(isStatusRequest(encodeStatusRequest())).toBe(true);
    expect(isStatusRequest('{"type":"debris-signal"}')).toBe(false);
    expect(isStatusRequest('not json')).toBe(false);
    expect(isStatusRequest('[]')).toBe(false);
  });

  it('round-trips a reply', () => {
    expect(decodeStatusReply(encodeStatusReply(STATUS))).toEqual(STATUS);
  });

  it('rejects malformed replies', () => {
    expect(decodeStatusReply('x')).toBeUndefined();
    expect(decodeStatusReply(JSON.stringify({ ...STATUS, status: 'paused' }))).toBeUndefined();
    expect(decodeStatusReply(JSON.stringify({ ...STATUS, passwordRequired: 'yes' }))).toBeUndefined();
    expect(decodeStatusReply(JSON.stringify({ ...STATUS, players: { current: -1, max: 4 } }))).toBeUndefined();
    expect(decodeStatusReply(JSON.stringify({ ...STATUS, players: null }))).toBeUndefined();
    expect(decodeStatusReply(JSON.stringify({ ...STATUS, mode: 'x' }))).toBeUndefined();
  });
});
