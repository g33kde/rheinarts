import { describe, expect, it } from 'vitest';
import {
  decodeInput,
  decodeSnapshot,
  encodeInput,
  encodeSnapshot,
  isNewerTick,
  type GameSnapshot,
  type InputMessage,
  type ShipSnapshot,
} from '../src/systems/NetworkSnapshotProtocol';

const SHIP: ShipSnapshot = {
  slotIndex: 0,
  x: 960,
  y: 600,
  heading: 1.57,
  alive: true,
  thrusting: false,
  invulnerableUntilMs: 0,
};

const SNAPSHOT: GameSnapshot = {
  type: 'debris-snapshot',
  tick: 42,
  nowMs: 123456,
  ships: [SHIP],
  entities: [
    { id: 1, type: 'asteroid', x: 100, y: 200, rotation: 0.3, data: { size: 'large' } },
    { id: 2, type: 'projectile', x: 50, y: 60, rotation: 0, data: { ownerIndex: 0 } },
  ],
};

const INPUT: InputMessage = {
  type: 'debris-input',
  slotIndex: 0,
  turnDirection: -1,
  isThrusting: true,
  isFiring: false,
  isHyperspacing: false,
};

describe('encodeSnapshot / decodeSnapshot', () => {
  it('round-trips a well-formed snapshot', () => {
    expect(decodeSnapshot(encodeSnapshot(SNAPSHOT))).toEqual(SNAPSHOT);
  });

  it('round-trips an empty ship list', () => {
    const empty: GameSnapshot = { ...SNAPSHOT, ships: [] };
    expect(decodeSnapshot(encodeSnapshot(empty))).toEqual(empty);
  });

  it('round-trips multiple ships', () => {
    const multi: GameSnapshot = { ...SNAPSHOT, ships: [SHIP, { ...SHIP, slotIndex: 1, alive: false }] };
    expect(decodeSnapshot(encodeSnapshot(multi))).toEqual(multi);
  });

  it('round-trips an empty entities list', () => {
    const empty: GameSnapshot = { ...SNAPSHOT, entities: [] };
    expect(decodeSnapshot(encodeSnapshot(empty))).toEqual(empty);
  });

  it('rejects a snapshot missing the entities array', () => {
    const withoutEntities: Record<string, unknown> = { ...SNAPSHOT };
    delete withoutEntities.entities;
    expect(decodeSnapshot(JSON.stringify(withoutEntities))).toBeUndefined();
  });

  it('rejects an entity with a non-primitive data value', () => {
    const bad = {
      ...SNAPSHOT,
      entities: [{ id: 1, type: 'asteroid', x: 0, y: 0, rotation: 0, data: { nested: { x: 1 } } }],
    };
    expect(decodeSnapshot(JSON.stringify(bad))).toBeUndefined();
  });

  it('rejects an entity missing required numeric fields', () => {
    const bad = { ...SNAPSHOT, entities: [{ id: 1, type: 'asteroid', x: 0, data: {} }] };
    expect(decodeSnapshot(JSON.stringify(bad))).toBeUndefined();
  });

  it('rejects garbage input instead of throwing', () => {
    expect(decodeSnapshot('not json')).toBeUndefined();
    expect(decodeSnapshot('{}')).toBeUndefined();
    expect(decodeSnapshot('null')).toBeUndefined();
  });

  it('rejects the wrong message type', () => {
    expect(decodeSnapshot(JSON.stringify({ ...SNAPSHOT, type: 'debris-input' }))).toBeUndefined();
  });

  it('rejects a malformed ship entry', () => {
    const bad = { ...SNAPSHOT, ships: [{ ...SHIP, x: '960' }] };
    expect(decodeSnapshot(JSON.stringify(bad))).toBeUndefined();
  });

  it('rejects a non-array ships field', () => {
    expect(decodeSnapshot(JSON.stringify({ ...SNAPSHOT, ships: SHIP }))).toBeUndefined();
  });
});

describe('encodeInput / decodeInput', () => {
  it('round-trips a well-formed input message', () => {
    expect(decodeInput(encodeInput(INPUT))).toEqual(INPUT);
  });

  it('round-trips every turnDirection value', () => {
    for (const turnDirection of [-1, 0, 1] as const) {
      const message = { ...INPUT, turnDirection };
      expect(decodeInput(encodeInput(message))).toEqual(message);
    }
  });

  it('rejects garbage input instead of throwing', () => {
    expect(decodeInput('not json')).toBeUndefined();
    expect(decodeInput('{}')).toBeUndefined();
  });

  it('rejects an invalid turnDirection', () => {
    expect(decodeInput(JSON.stringify({ ...INPUT, turnDirection: 2 }))).toBeUndefined();
  });

  it('rejects a missing boolean field', () => {
    expect(decodeInput(JSON.stringify({ ...INPUT, isThrusting: undefined }))).toBeUndefined();
  });
});

describe('isNewerTick', () => {
  it('is true for a strictly greater tick', () => {
    expect(isNewerTick(5, 4)).toBe(true);
  });

  it('is false for an equal or lesser tick', () => {
    expect(isNewerTick(4, 4)).toBe(false);
    expect(isNewerTick(3, 4)).toBe(false);
  });
});
