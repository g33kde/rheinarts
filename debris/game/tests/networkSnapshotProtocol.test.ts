import { describe, expect, it } from 'vitest';
import {
  decodeInput,
  decodeSnapshot,
  encodeInput,
  encodeSnapshot,
  isNewerTick,
  roundForWire,
  type GameSnapshot,
  type InputMessage,
  type ShipSnapshot,
  type ShopPanelSnapshot,
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
  players: [
    {
      slotIndex: 0,
      score: 500,
      lives: 2,
      comboMultiplier: 1,
      scrap: 0,
      eliminated: false,
      statusLine: null,
    },
  ],
  state: 'playing',
  overlayLines: [],
  shop: undefined,
  events: [],
  wrecks: [],
  scrapSeconds: null,
  music: 'gameplay',
};

const SHOP_PANEL: ShopPanelSnapshot = {
  slotIndex: 0,
  eliminated: false,
  headerText: 'P1   SCRAP 3',
  rows: [{ text: '  HEAVY SHOT   3', colorHex: '#dfe1ef' }],
  voteLabel: '- VOTE: NEXT STAGE -',
  voteRows: [{ text: ' *STANDARD      1', colorHex: '#ff0000' }],
  readyText: 'READY?',
  readyColorHex: '#6a6a80',
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

  it('round-trips a cooperative statusLine string', () => {
    const withStatus: GameSnapshot = {
      ...SNAPSHOT,
      players: [{ ...SNAPSHOT.players[0]!, statusLine: 'EJECTED' }],
    };
    expect(decodeSnapshot(encodeSnapshot(withStatus))).toEqual(withStatus);
  });

  it('rejects a snapshot missing the players array', () => {
    const withoutPlayers: Record<string, unknown> = { ...SNAPSHOT };
    delete withoutPlayers.players;
    expect(decodeSnapshot(JSON.stringify(withoutPlayers))).toBeUndefined();
  });

  it('rejects a player HUD entry with the wrong statusLine type', () => {
    const bad = { ...SNAPSHOT, players: [{ ...SNAPSHOT.players[0], statusLine: 42 }] };
    expect(decodeSnapshot(JSON.stringify(bad))).toBeUndefined();
  });

  it('rejects a player HUD entry missing required fields', () => {
    const bad = { ...SNAPSHOT, players: [{ slotIndex: 0, score: 1 }] };
    expect(decodeSnapshot(JSON.stringify(bad))).toBeUndefined();
  });

  it('round-trips overlay lines', () => {
    const withOverlay: GameSnapshot = { ...SNAPSHOT, overlayLines: ['THE FRACTURE'] };
    expect(decodeSnapshot(encodeSnapshot(withOverlay))).toEqual(withOverlay);
  });

  it('rejects a snapshot missing state', () => {
    const withoutState: Record<string, unknown> = { ...SNAPSHOT };
    delete withoutState.state;
    expect(decodeSnapshot(JSON.stringify(withoutState))).toBeUndefined();
  });

  it('rejects a non-array overlayLines field', () => {
    expect(decodeSnapshot(JSON.stringify({ ...SNAPSHOT, overlayLines: 'nope' }))).toBeUndefined();
  });

  it('round-trips a snapshot with no shop open (shop omitted entirely)', () => {
    const encoded = encodeSnapshot(SNAPSHOT);
    expect(JSON.parse(encoded)).not.toHaveProperty('shop');
    expect(decodeSnapshot(encoded)).toEqual(SNAPSHOT);
  });

  it('round-trips a full shop snapshot', () => {
    const withShop: GameSnapshot = {
      ...SNAPSHOT,
      state: 'shop',
      shop: {
        headline: 'STAGE CLEARED   -   RANK A',
        subheadline: 'SHOP - SPEND YOUR SCRAP',
        hint: 'TURN: select   FIRE: buy / vote / toggle ready',
        panels: [SHOP_PANEL],
      },
    };
    expect(decodeSnapshot(encodeSnapshot(withShop))).toEqual(withShop);
  });

  it('round-trips an eliminated panel with null vote/ready fields', () => {
    const eliminatedPanel: ShopPanelSnapshot = {
      slotIndex: 1,
      eliminated: true,
      headerText: 'P2\nOUT',
      rows: [],
      voteLabel: null,
      voteRows: [],
      readyText: null,
      readyColorHex: null,
    };
    const withShop: GameSnapshot = {
      ...SNAPSHOT,
      shop: { headline: 'h', subheadline: 's', hint: 'i', panels: [eliminatedPanel] },
    };
    expect(decodeSnapshot(encodeSnapshot(withShop))).toEqual(withShop);
  });

  it('rejects a shop panel with a malformed row', () => {
    const bad = {
      ...SNAPSHOT,
      shop: { headline: 'h', subheadline: 's', hint: 'i', panels: [{ ...SHOP_PANEL, rows: [{ text: 1 }] }] },
    };
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

describe('snapshot rounding', () => {
  const noisy: GameSnapshot = {
    ...SNAPSHOT,
    nowMs: 123456.789012345,
    ships: [{ ...SHIP, x: 960.123456789012, y: 600.987654321098, heading: 1.5707963267948966, invulnerableUntilMs: 123457.789012345 }],
    entities: [
      { id: 1, type: 'asteroid', x: 100.04999, y: 200.06, rotation: 0.30000123456, data: { size: 'large', facingAngleRad: 2.0001234567, detonationProgress: 0.123456789 } },
    ],
  };

  it('rounds positions to 0.1 and angles to 3 decimals', () => {
    const decoded = decodeSnapshot(encodeSnapshot(noisy))!;
    expect(decoded.ships[0]).toMatchObject({ x: 960.1, y: 601, heading: 1.571 });
    expect(decoded.entities[0]).toMatchObject({ x: 100, y: 200.1, rotation: 0.3 });
    expect(decoded.entities[0]!.data.facingAngleRad).toBe(2);
  });

  it('never rounds timing or progress fields', () => {
    const decoded = decodeSnapshot(encodeSnapshot(noisy))!;
    expect(decoded.nowMs).toBe(123456.789012345);
    expect(decoded.ships[0]!.invulnerableUntilMs).toBe(123457.789012345);
    expect(decoded.entities[0]!.data.detonationProgress).toBe(0.123456789);
  });

  it('leaves non-numbers and non-finite values alone', () => {
    expect(roundForWire('x', 'text')).toBe('text');
    expect(roundForWire('x', Infinity)).toBe(Infinity);
    expect(roundForWire('size', 1.23456)).toBe(1.23456);
  });

  it('makes a typical snapshot materially smaller', () => {
    const entities = Array.from({ length: 40 }, (_, i) => ({
      id: i, type: 'asteroid', x: Math.random() * 1920, y: Math.random() * 1080,
      rotation: Math.random() * 6.28, data: { size: 'large' },
    }));
    const snap: GameSnapshot = { ...SNAPSHOT, entities };
    expect(encodeSnapshot(snap).length).toBeLessThan(JSON.stringify(snap).length * 0.85);
  });
});

describe('ships that are not invulnerable', () => {
  // The host sends -Infinity for "never invulnerable"; JSON writes that as null.
  const vulnerable: GameSnapshot = { ...SNAPSHOT, ships: [{ ...SHIP, invulnerableUntilMs: -Infinity }] };

  it('still decodes - the whole snapshot used to be dropped', () => {
    const decoded = decodeSnapshot(encodeSnapshot(vulnerable));
    expect(decoded).toBeDefined();
    expect(decoded!.ships[0]!.invulnerableUntilMs).toBe(-Infinity);
  });

  it('keeps every other ship in the snapshot', () => {
    const mixed: GameSnapshot = {
      ...SNAPSHOT,
      ships: [
        { ...SHIP, slotIndex: 0, invulnerableUntilMs: -Infinity },
        { ...SHIP, slotIndex: 1, invulnerableUntilMs: 5000 },
      ],
    };
    const decoded = decodeSnapshot(encodeSnapshot(mixed))!;
    expect(decoded.ships.map((s) => s.invulnerableUntilMs)).toEqual([-Infinity, 5000]);
  });

  it('still rejects a ship whose invulnerableUntilMs is some other non-number', () => {
    const raw = JSON.stringify({ ...SNAPSHOT, ships: [{ ...SHIP, invulnerableUntilMs: 'soon' }] });
    expect(decodeSnapshot(raw)).toBeUndefined();
  });
});

describe('effects in a snapshot', () => {
  const withEvents: GameSnapshot = {
    ...SNAPSHOT,
    music: 'cardinal',
    events: [
      { id: 7, kind: 'sfx', sfx: 'shot' },
      { id: 8, kind: 'burst', x: 100.5, y: 200, color: 0xff8800, style: 'asteroid' },
      { id: 9, kind: 'shake', durationMs: 250, intensity: 0.01 },
      { id: 10, kind: 'popup', x: 5, y: 6, color: 0x00ffff, amount: 40 },
    ],
  };

  it('round-trips events and the music track', () => {
    const decoded = decodeSnapshot(encodeSnapshot(withEvents))!;
    expect(decoded.events).toEqual(withEvents.events);
    expect(decoded.music).toBe('cardinal');
  });

  it('rounds a burst position like every other position, and leaves the colour exact', () => {
    const noisy: GameSnapshot = { ...SNAPSHOT, events: [{ id: 1, kind: 'burst', x: 100.04999, y: 200.06, color: 0xff8800, style: 'ship' }] };
    const burst = decodeSnapshot(encodeSnapshot(noisy))!.events[0]!;
    expect(burst).toMatchObject({ x: 100, y: 200.1, color: 0xff8800 });
  });

  it('drops a malformed event on its own and keeps the snapshot and its other events', () => {
    const raw = JSON.parse(encodeSnapshot(withEvents)) as Record<string, unknown>;
    raw.events = [{ id: 1, kind: 'sfx', sfx: 'shot' }, { id: 2, kind: 'nuke' }, { id: 3, kind: 'shake', durationMs: 9e9, intensity: 1 }, null, { id: 4, kind: 'sfx', sfx: 'ufoShot' }];
    const decoded = decodeSnapshot(JSON.stringify(raw));
    expect(decoded).toBeDefined();
    expect(decoded!.events.map((e) => e.id)).toEqual([1, 4]);
    expect(decoded!.ships).toHaveLength(1);
  });

  it('treats a missing or non-array events field (an older host) as no effects', () => {
    const raw = JSON.parse(encodeSnapshot(SNAPSHOT)) as Record<string, unknown>;
    delete raw.events;
    expect(decodeSnapshot(JSON.stringify(raw))!.events).toEqual([]);
    raw.events = 'boom';
    expect(decodeSnapshot(JSON.stringify(raw))!.events).toEqual([]);
  });

  it('falls back to the normal track for a missing or unknown music name', () => {
    const raw = JSON.parse(encodeSnapshot(SNAPSHOT)) as Record<string, unknown>;
    delete raw.music;
    expect(decodeSnapshot(JSON.stringify(raw))!.music).toBe('gameplay');
    raw.music = 'polka';
    expect(decodeSnapshot(JSON.stringify(raw))!.music).toBe('gameplay');
  });
});

describe('terrain and the scrap countdown in a snapshot', () => {
  const wreck = { x: 640.5, y: 400.25, radius: 90, seed: 54321 };

  it('round-trips wrecks, with positions rounded like every other position and the seed exact', () => {
    const decoded = decodeSnapshot(encodeSnapshot({ ...SNAPSHOT, wrecks: [{ x: 640.04999, y: 400.26, radius: 90, seed: 4294967295 }] }))!;
    expect(decoded.wrecks).toEqual([{ x: 640, y: 400.3, radius: 90, seed: 4294967295 }]);
  });

  it('rounds a wreck radius like a position, so it is not sent as an 18-digit float', () => {
    const decoded = decodeSnapshot(encodeSnapshot({ ...SNAPSHOT, wrecks: [{ x: 1, y: 2, radius: 43.055852126191425, seed: 24274 }] }))!;
    expect(decoded.wrecks[0]!.radius).toBe(43.1);
    expect(encodeSnapshot({ ...SNAPSHOT, wrecks: [{ x: 1, y: 2, radius: 43.055852126191425, seed: 24274 }] })).not.toContain('43.0558');
  });

  it('keeps several wrecks in order', () => {
    const decoded = decodeSnapshot(encodeSnapshot({ ...SNAPSHOT, wrecks: [wreck, { ...wreck, x: 100, seed: 7 }] }))!;
    expect(decoded.wrecks.map((w) => w.seed)).toEqual([54321, 7]);
  });

  it('drops a malformed wreck on its own and keeps the snapshot', () => {
    const raw = JSON.parse(encodeSnapshot({ ...SNAPSHOT, wrecks: [wreck] })) as Record<string, unknown>;
    raw.wrecks = [wreck, { x: 1e300, y: 0, radius: 50, seed: 1 }, { x: 0, y: 0, radius: -5, seed: 1 }, { x: 0, y: 0, radius: 50, seed: 1.5 }, { x: 0, y: 0, radius: 50 }, null, 'x', { ...wreck, seed: 2 }];
    const decoded = decodeSnapshot(JSON.stringify(raw))!;
    expect(decoded.wrecks.map((w) => w.seed)).toEqual([54321, 2]);
    expect(decoded.ships).toHaveLength(1);
  });

  it('treats a missing or non-array wrecks field (an older host) as no terrain, and caps the count', () => {
    const raw = JSON.parse(encodeSnapshot(SNAPSHOT)) as Record<string, unknown>;
    delete raw.wrecks;
    expect(decodeSnapshot(JSON.stringify(raw))!.wrecks).toEqual([]);
    raw.wrecks = 'boom';
    expect(decodeSnapshot(JSON.stringify(raw))!.wrecks).toEqual([]);
    raw.wrecks = Array.from({ length: 100 }, (_, i) => ({ ...wreck, seed: i }));
    expect(decodeSnapshot(JSON.stringify(raw))!.wrecks).toHaveLength(32);
  });

  it('carries the scrap countdown as whole seconds, or null', () => {
    expect(decodeSnapshot(encodeSnapshot({ ...SNAPSHOT, scrapSeconds: 7 }))!.scrapSeconds).toBe(7);
    expect(decodeSnapshot(encodeSnapshot({ ...SNAPSHOT, scrapSeconds: 0 }))!.scrapSeconds).toBe(0);
    expect(decodeSnapshot(encodeSnapshot({ ...SNAPSHOT, scrapSeconds: null }))!.scrapSeconds).toBeNull();
    const raw = JSON.parse(encodeSnapshot(SNAPSHOT)) as Record<string, unknown>;
    delete raw.scrapSeconds;
    expect(decodeSnapshot(JSON.stringify(raw))!.scrapSeconds).toBeNull();
    for (const bad of ['7', -3, 99999, NaN, {}]) {
      raw.scrapSeconds = bad as unknown;
      expect(decodeSnapshot(JSON.stringify(raw))!.scrapSeconds).toBeNull();
    }
  });
});
