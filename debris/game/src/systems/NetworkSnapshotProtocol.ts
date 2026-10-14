/**
 * Pure wire format for the two messages that actually flow once a
 * connection is up (docs/roadmap.md's "Windows + LAN multiplayer,"
 * Sprint 6) - no RtcConnection, no GameScene, same convention every
 * other protocol module in this codebase follows.
 *
 * Ships kept their own dedicated `ShipSnapshot` shape (alive/thrusting/
 * invulnerability aren't generic concepts, and there are only ever 4) -
 * everything else the client needs to see (asteroids, projectiles, and
 * every entity type after it, Sprint 8 onward) rides the generic
 * `EntitySnapshot` shape below instead of each getting its own bespoke
 * sync path. `data` is a loose, type-tagged bag rather than a
 * discriminated union so a new synced entity type never needs to touch
 * this protocol file - only the host-side builder and the client-side
 * mirror factory for that `type` string.
 *
 * Both messages travel over a connection's *unreliable* channel
 * (`RtcConnection.ts`) - a dropped one is simply superseded by the next,
 * same reasoning that channel's own doc comment already gives. `tick`
 * exists so a receiver can discard a snapshot that arrived out of order
 * (unreliable + unordered means that can happen) rather than briefly
 * rendering a stale position after a newer one already arrived.
 */

import { NETWORK_SYNC } from '../config/GameConfig';
import { MUSIC_IDS, sanitizeEvents, type GameEvent, type MusicId } from './GameEvents';

export type EntityDataValue = number | string | boolean;

export interface EntitySnapshot {
  /** Host-assigned, stable for the entity's lifetime, unique within its own `type` (not globally) - see `GameScene.networkIdFor`. */
  readonly id: number;
  readonly type: string;
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly data: Readonly<Record<string, EntityDataValue>>;
}

export interface ShipSnapshot {
  readonly slotIndex: number;
  readonly x: number;
  readonly y: number;
  readonly heading: number;
  readonly alive: boolean;
  readonly thrusting: boolean;
  /** Carried as-is rather than a derived "isInvulnerable" bool, so a client's own Ship.render() flicker check (Ship.ts's `isInvulnerable(this.lastNowMs)`) reproduces identically off the host's own clock. */
  readonly invulnerableUntilMs: number;
}

/**
 * One player slot's score/lives/combo/scrap/status (docs/roadmap.md's
 * "Windows + LAN multiplayer," Sprint 10) - sent for every slot every
 * tick, unlike `ships`, which drops a slot once its ship is actually
 * destroyed. A player's HUD (score, "ELIMINATED", ...) still needs to
 * read correctly after that point, so this list is never filtered by
 * alive/eliminated the way `ships` is.
 */
export interface PlayerHudSnapshot {
  readonly slotIndex: number;
  readonly score: number;
  readonly lives: number;
  readonly comboMultiplier: number;
  readonly scrap: number;
  readonly eliminated: boolean;
  readonly statusLine: string | null;
}

/** One pre-formatted line of shop text plus the exact color the host would draw it in - sent fully rendered (docs/roadmap.md's "Windows + LAN multiplayer," Sprint 14) rather than the raw ingredients (owned/affordable/selected/...), so the client never re-derives shop text-coloring rules that could drift from the host's own `refreshShopPanel`. */
export interface ShopRowSnapshot {
  readonly text: string;
  readonly colorHex: string;
}

export interface ShopPanelSnapshot {
  readonly slotIndex: number;
  readonly eliminated: boolean;
  readonly headerText: string;
  readonly rows: readonly ShopRowSnapshot[];
  readonly voteLabel: string | null;
  readonly voteRows: readonly ShopRowSnapshot[];
  readonly readyText: string | null;
  readonly readyColorHex: string | null;
}

/** The whole stage-clear shop screen, `undefined` whenever the host isn't actually showing it - a client tears its own shop UI down the instant this goes missing, regardless of `state`. */
export interface ShopSnapshot {
  readonly headline: string;
  readonly subheadline: string;
  readonly hint: string;
  readonly panels: readonly ShopPanelSnapshot[];
}

export interface GameSnapshot {
  readonly type: 'debris-snapshot';
  readonly tick: number;
  readonly nowMs: number;
  readonly ships: readonly ShipSnapshot[];
  readonly entities: readonly EntitySnapshot[];
  readonly players: readonly PlayerHudSnapshot[];
  /** GameScene's own `SessionState` - carried as a plain string rather than importing that type here (it lives in the scene, not a systems module) so this protocol file never depends on Phaser-coupled code. */
  readonly state: string;
  /** Whatever `this.overlayTexts` currently shows host-side (boss announcement, game over, paused, ...) - empty when no overlay is up. */
  readonly overlayLines: readonly string[];
  readonly shop: ShopSnapshot | undefined;
  /** One-shot effects fired recently (sounds, bursts, shake, popups) - each repeats in a few consecutive snapshots and the client plays it once (`systems/GameEvents.ts`). */
  readonly events: readonly GameEvent[];
  /** Which stage music the host is playing. State rather than an event: a client that joins late, or misses a packet, still lands on the right track. */
  readonly music: MusicId;
}

export interface InputMessage {
  readonly type: 'debris-input';
  readonly slotIndex: number;
  readonly turnDirection: -1 | 0 | 1;
  readonly isThrusting: boolean;
  readonly isFiring: boolean;
  readonly isHyperspacing: boolean;
}

const POSITION_KEYS: ReadonlySet<string> = new Set(['x', 'y']);
const ANGLE_KEYS: ReadonlySet<string> = new Set(['rotation', 'heading', 'facingAngleRad']);

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * `JSON.stringify` replacer that trims the float noise a snapshot would
 * otherwise carry (17-digit positions and angles dominate its size).
 * Keyed by property name on purpose, not "round every number": the timing
 * fields (`nowMs`, `invulnerableUntilMs`, elapsed/phase timers) are
 * compared against each other on the client and must stay exact.
 */
export function roundForWire(key: string, value: unknown): unknown {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value;
  if (POSITION_KEYS.has(key)) return roundTo(value, NETWORK_SYNC.positionDecimals);
  if (ANGLE_KEYS.has(key)) return roundTo(value, NETWORK_SYNC.angleDecimals);
  return value;
}

export function encodeSnapshot(snapshot: GameSnapshot): string {
  return JSON.stringify(snapshot, roundForWire);
}

function isShipSnapshot(value: unknown): value is ShipSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.slotIndex === 'number' &&
    typeof s.x === 'number' &&
    typeof s.y === 'number' &&
    typeof s.heading === 'number' &&
    typeof s.alive === 'boolean' &&
    typeof s.thrusting === 'boolean' &&
    typeof s.invulnerableUntilMs === 'number'
  );
}

function isPlayerHudSnapshot(value: unknown): value is PlayerHudSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.slotIndex === 'number' &&
    typeof p.score === 'number' &&
    typeof p.lives === 'number' &&
    typeof p.comboMultiplier === 'number' &&
    typeof p.scrap === 'number' &&
    typeof p.eliminated === 'boolean' &&
    (p.statusLine === null || typeof p.statusLine === 'string')
  );
}

function isShopRowSnapshot(value: unknown): value is ShopRowSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return typeof r.text === 'string' && typeof r.colorHex === 'string';
}

function isShopPanelSnapshot(value: unknown): value is ShopPanelSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.slotIndex === 'number' &&
    typeof p.eliminated === 'boolean' &&
    typeof p.headerText === 'string' &&
    Array.isArray(p.rows) &&
    p.rows.every(isShopRowSnapshot) &&
    (p.voteLabel === null || typeof p.voteLabel === 'string') &&
    Array.isArray(p.voteRows) &&
    p.voteRows.every(isShopRowSnapshot) &&
    (p.readyText === null || typeof p.readyText === 'string') &&
    (p.readyColorHex === null || typeof p.readyColorHex === 'string')
  );
}

function isShopSnapshot(value: unknown): value is ShopSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.headline === 'string' &&
    typeof s.subheadline === 'string' &&
    typeof s.hint === 'string' &&
    Array.isArray(s.panels) &&
    s.panels.every(isShopPanelSnapshot)
  );
}

function isEntityDataValue(value: unknown): value is EntityDataValue {
  return typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean';
}

function isEntitySnapshot(value: unknown): value is EntitySnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === 'number' &&
    typeof e.type === 'string' &&
    typeof e.x === 'number' &&
    typeof e.y === 'number' &&
    typeof e.rotation === 'number' &&
    typeof e.data === 'object' &&
    e.data !== null &&
    Object.values(e.data).every(isEntityDataValue)
  );
}

/** `undefined` for anything that isn't a well-formed `GameSnapshot` - a malformed packet is silently ignored, not a crash, same convention every other decode function in this codebase follows. */
/**
 * A ship that is not invulnerable is sent with `invulnerableUntilMs:
 * -Infinity` (`GameScene.broadcastHostSnapshot`), and `JSON.stringify`
 * writes a non-finite number as `null`. Left alone, `isShipSnapshot`
 * would reject the ship - and with it the *whole snapshot* - so a client
 * would only ever see a frame while every ship happened to be dead or
 * invulnerable. Read `null` back as the `-Infinity` it was.
 */
function restoreNonFiniteShipFields(ships: unknown[]): unknown[] {
  return ships.map((ship) =>
    typeof ship === 'object' && ship !== null && (ship as Record<string, unknown>).invulnerableUntilMs === null
      ? { ...(ship as Record<string, unknown>), invulnerableUntilMs: -Infinity }
      : ship,
  );
}

export function decodeSnapshot(raw: string): GameSnapshot | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const candidate = parsed as Record<string, unknown>;
  if (Array.isArray(candidate.ships)) candidate.ships = restoreNonFiniteShipFields(candidate.ships);

  if (candidate.type !== 'debris-snapshot') return undefined;
  if (typeof candidate.tick !== 'number') return undefined;
  if (typeof candidate.nowMs !== 'number') return undefined;
  if (!Array.isArray(candidate.ships) || !candidate.ships.every(isShipSnapshot)) return undefined;
  if (!Array.isArray(candidate.entities) || !candidate.entities.every(isEntitySnapshot)) return undefined;
  if (!Array.isArray(candidate.players) || !candidate.players.every(isPlayerHudSnapshot)) return undefined;
  if (typeof candidate.state !== 'string') return undefined;
  if (!Array.isArray(candidate.overlayLines) || !candidate.overlayLines.every((l) => typeof l === 'string')) {
    return undefined;
  }
  if (candidate.shop !== undefined && !isShopSnapshot(candidate.shop)) return undefined;
  // Effects are decorative: an event or a track name we do not understand is dropped or defaulted,
  // never a reason to throw the whole snapshot (and the positions in it) away.
  const music: MusicId = (MUSIC_IDS as readonly unknown[]).includes(candidate.music) ? (candidate.music as MusicId) : 'gameplay';

  return {
    type: 'debris-snapshot',
    tick: candidate.tick,
    nowMs: candidate.nowMs,
    ships: candidate.ships as ShipSnapshot[],
    entities: candidate.entities as EntitySnapshot[],
    players: candidate.players as PlayerHudSnapshot[],
    state: candidate.state,
    overlayLines: candidate.overlayLines as string[],
    events: sanitizeEvents(candidate.events),
    music,
    shop: candidate.shop as ShopSnapshot | undefined,
  };
}

export function encodeInput(message: InputMessage): string {
  return JSON.stringify(message);
}

export function decodeInput(raw: string): InputMessage | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const candidate = parsed as Record<string, unknown>;

  if (candidate.type !== 'debris-input') return undefined;
  if (typeof candidate.slotIndex !== 'number') return undefined;
  if (candidate.turnDirection !== -1 && candidate.turnDirection !== 0 && candidate.turnDirection !== 1) return undefined;
  if (typeof candidate.isThrusting !== 'boolean') return undefined;
  if (typeof candidate.isFiring !== 'boolean') return undefined;
  if (typeof candidate.isHyperspacing !== 'boolean') return undefined;

  return {
    type: 'debris-input',
    slotIndex: candidate.slotIndex,
    turnDirection: candidate.turnDirection,
    isThrusting: candidate.isThrusting,
    isFiring: candidate.isFiring,
    isHyperspacing: candidate.isHyperspacing,
  };
}

/** A snapshot is newer than another's only if it says it is - unreliable + unordered delivery means a client can receive ticks out of sequence, and this is the one-line check that lets it just keep whichever is actually newest. */
export function isNewerTick(candidateTick: number, currentTick: number): boolean {
  return candidateTick > currentTick;
}
