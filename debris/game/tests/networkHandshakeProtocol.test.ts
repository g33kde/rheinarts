import { describe, expect, it } from 'vitest';
import {
  decodeLobbyCommand,
  decodeLobbyState,
  decodeReject,
  decodeWelcome,
  encodeLobbyCommand,
  encodeLobbyState,
  encodeReject,
  encodeWelcome,
  type LobbyStateMessage,
  type WelcomeMessage,
} from '../src/systems/NetworkHandshakeProtocol';

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

const LOBBY: LobbyStateMessage = {
  type: 'debris-lobby',
  status: 'lobby',
  mode: 'competitive',
  maxPlayers: 4,
  leaderSlot: 1,
  slots: [1, 0],
};

describe('lobby state', () => {
  it('round-trips', () => {
    expect(decodeLobbyState(encodeLobbyState(LOBBY))).toEqual(LOBBY);
  });

  it('accepts an empty lobby with no leader', () => {
    const empty = { ...LOBBY, leaderSlot: -1, slots: [] };
    expect(decodeLobbyState(encodeLobbyState(empty))).toEqual(empty);
  });

  it('rejects malformed input instead of throwing', () => {
    expect(decodeLobbyState('nope')).toBeUndefined();
    expect(decodeLobbyState('[]')).toBeUndefined();
    expect(decodeLobbyState(JSON.stringify({ ...LOBBY, status: 'paused' }))).toBeUndefined();
    expect(decodeLobbyState(JSON.stringify({ ...LOBBY, mode: 'singlePlayer' }))).toBeUndefined();
    expect(decodeLobbyState(JSON.stringify({ ...LOBBY, slots: [0, 'x'] }))).toBeUndefined();
    expect(decodeLobbyState(JSON.stringify({ ...LOBBY, leaderSlot: '1' }))).toBeUndefined();
    expect(decodeLobbyState(JSON.stringify({ ...LOBBY, type: 'debris-welcome' }))).toBeUndefined();
  });
});

describe('lobby commands', () => {
  it('round-trips start and setMode', () => {
    const start = { type: 'debris-lobby-command', action: 'start' } as const;
    const setMode = { type: 'debris-lobby-command', action: 'setMode', mode: 'competitive' } as const;
    expect(decodeLobbyCommand(encodeLobbyCommand(start))).toEqual(start);
    expect(decodeLobbyCommand(encodeLobbyCommand(setMode))).toEqual(setMode);
  });

  it('drops anything extra a client tacks on', () => {
    const raw = JSON.stringify({ type: 'debris-lobby-command', action: 'start', slotIndex: 0, admin: true });
    expect(decodeLobbyCommand(raw)).toEqual({ type: 'debris-lobby-command', action: 'start' });
  });

  it('rejects unknown actions, bad modes and garbage', () => {
    expect(decodeLobbyCommand('{')).toBeUndefined();
    expect(decodeLobbyCommand(JSON.stringify({ type: 'debris-lobby-command', action: 'kick' }))).toBeUndefined();
    expect(decodeLobbyCommand(JSON.stringify({ type: 'debris-lobby-command', action: 'setMode', mode: 'chaos' }))).toBeUndefined();
    expect(decodeLobbyCommand(JSON.stringify({ type: 'debris-lobby-command', action: 'setMode' }))).toBeUndefined();
    expect(decodeLobbyCommand(JSON.stringify({ type: 'other', action: 'start' }))).toBeUndefined();
  });
});

describe('reject', () => {
  it('round-trips both reasons', () => {
    for (const reason of ['full', 'matchInProgress'] as const) {
      const message = { type: 'debris-reject', reason } as const;
      expect(decodeReject(encodeReject(message))).toEqual(message);
    }
  });

  it('rejects unknown reasons and garbage', () => {
    expect(decodeReject(JSON.stringify({ type: 'debris-reject', reason: 'banned' }))).toBeUndefined();
    expect(decodeReject('x')).toBeUndefined();
  });
});
