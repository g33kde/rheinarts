/**
 * One-shot effects a host's simulation fires - a sound, an explosion, a
 * screen shake, a score popup - as data a client can replay (docs/
 * roadmap.md's "Windows + LAN multiplayer"). A snapshot describes *state*,
 * so without this a client could see a rock vanish but never hear it, or
 * see it burst: those are things that *happen*, not things that *are*.
 *
 * **Delivery.** Snapshots travel an unreliable channel, so an event rides in
 * the next `redundancy` snapshots (not just one) and the client plays each
 * `id` once: losing a packet or two costs nothing, and a snapshot that
 * arrives late or out of order cannot replay anything. Counting snapshots
 * rather than milliseconds keeps that true at any snapshot rate.
 *
 * What is *not* an event: the stage music (state - it is in the snapshot as
 * `music`) and the engine hum (derived from each ship's `thrusting` flag).
 */

export const SFX_IDS = [
  'shot',
  'asteroidHit',
  'shipDestroyed',
  'shieldPickup',
  'blackHoleApproaching',
  'ufoSpawn',
  'ufoShot',
  'ufoDestroyed',
] as const;
export type SfxId = (typeof SFX_IDS)[number];

export const BURST_STYLES = ['ship', 'asteroid', 'ufo', 'mine'] as const;
export type BurstStyle = (typeof BURST_STYLES)[number];

export const MUSIC_IDS = ['gameplay', 'fracture', 'cardinal'] as const;
export type MusicId = (typeof MUSIC_IDS)[number];

export type GameEventBody =
  | { readonly kind: 'sfx'; readonly sfx: SfxId }
  | { readonly kind: 'burst'; readonly x: number; readonly y: number; readonly color: number; readonly style: BurstStyle }
  | { readonly kind: 'shake'; readonly durationMs: number; readonly intensity: number }
  | { readonly kind: 'popup'; readonly x: number; readonly y: number; readonly color: number; readonly amount: number };

export type GameEvent = GameEventBody & { readonly id: number };

/** Hard cap per snapshot - a host in a frenzy must not be able to flood a client, and a client must not trust it to behave. */
export const MAX_EVENTS_PER_SNAPSHOT = 64;

const MAX_COORD = 10000;
const isCoord = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= MAX_COORD;
const isColor = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 0xffffff;

/**
 * Strict check of one event, with sane bounds: events come off the network,
 * and a shake of a million milliseconds or a popup at x = 1e300 must be
 * ignored, not obeyed.
 */
export function isGameEvent(value: unknown): value is GameEvent {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  if (!Number.isInteger(e.id) || (e.id as number) < 1) return false;
  switch (e.kind) {
    case 'sfx':
      return typeof e.sfx === 'string' && (SFX_IDS as readonly string[]).includes(e.sfx);
    case 'burst':
      return isCoord(e.x) && isCoord(e.y) && isColor(e.color) && typeof e.style === 'string' && (BURST_STYLES as readonly string[]).includes(e.style);
    case 'shake':
      return typeof e.durationMs === 'number' && e.durationMs > 0 && e.durationMs <= 2000 && typeof e.intensity === 'number' && e.intensity > 0 && e.intensity <= 0.05;
    case 'popup':
      return isCoord(e.x) && isCoord(e.y) && isColor(e.color) && Number.isInteger(e.amount) && (e.amount as number) >= 0 && (e.amount as number) <= 1_000_000;
    default:
      return false;
  }
}

/**
 * The events in a received snapshot. **Lenient on purpose**: a malformed
 * event is dropped on its own; it never costs the client the whole
 * snapshot (an unrelated field once did exactly that - see
 * `decodeSnapshot`'s ship handling). Anything that is not an array is none.
 */
export function sanitizeEvents(raw: unknown): GameEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isGameEvent).slice(0, MAX_EVENTS_PER_SNAPSHOT);
}

/** Host side: collects events as the simulation fires them and hands each one out for `redundancy` consecutive snapshots. */
export class EventRecorder {
  private nextId = 1;
  private pending: { event: GameEvent; sent: number }[] = [];

  constructor(private readonly redundancy: number) {}

  emit(body: GameEventBody): void {
    this.pending.push({ event: { ...body, id: this.nextId } as GameEvent, sent: 0 });
    this.nextId += 1;
  }

  /** The events to put in the snapshot being sent right now. Call once per snapshot actually sent - an event is counted as delivered each time. */
  collect(): GameEvent[] {
    const out = this.pending.map((p) => p.event);
    this.pending.forEach((p) => {
      p.sent += 1;
    });
    this.pending = this.pending.filter((p) => p.sent < this.redundancy);
    return out.length > MAX_EVENTS_PER_SNAPSHOT ? out.slice(out.length - MAX_EVENTS_PER_SNAPSHOT) : out;
  }

  /** Forget everything (a new match). Ids restart, so the client resets its own dedupe at the same moment. */
  reset(): void {
    this.nextId = 1;
    this.pending = [];
  }
}

/** Client side: lets each event through once, in order, however many snapshots repeat it or in what order they arrive. */
export class EventDeduper {
  private lastId = 0;

  accept(events: readonly GameEvent[]): GameEvent[] {
    const fresh = events.filter((e) => e.id > this.lastId).sort((a, b) => a.id - b.id);
    if (fresh.length > 0) this.lastId = fresh[fresh.length - 1]!.id;
    return fresh;
  }

  reset(): void {
    this.lastId = 0;
  }
}
