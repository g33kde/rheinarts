/**
 * Pure wire format for the two messages that actually flow once a
 * connection is up (docs/roadmap.md's "Windows + LAN multiplayer,"
 * Sprint 6) - no RtcConnection, no GameScene, same convention every
 * other protocol module in this codebase follows.
 *
 * **Scoped to ship positions only, deliberately.** Proving host-to-
 * client position sync for the one thing every multiplayer match
 * absolutely needs (seeing the other players move) is this sprint's
 * whole goal - asteroids, hazards, and scoring staying in sync is
 * real, separate follow-up work, not assumed to fall out of this for
 * free.
 *
 * Both messages travel over a connection's *unreliable* channel
 * (`RtcConnection.ts`) - a dropped one is simply superseded by the next,
 * same reasoning that channel's own doc comment already gives. `tick`
 * exists so a receiver can discard a snapshot that arrived out of order
 * (unreliable + unordered means that can happen) rather than briefly
 * rendering a stale position after a newer one already arrived.
 */

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

export interface GameSnapshot {
  readonly type: 'debris-snapshot';
  readonly tick: number;
  readonly nowMs: number;
  readonly ships: readonly ShipSnapshot[];
}

export interface InputMessage {
  readonly type: 'debris-input';
  readonly slotIndex: number;
  readonly turnDirection: -1 | 0 | 1;
  readonly isThrusting: boolean;
  readonly isFiring: boolean;
  readonly isHyperspacing: boolean;
}

export function encodeSnapshot(snapshot: GameSnapshot): string {
  return JSON.stringify(snapshot);
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

/** `undefined` for anything that isn't a well-formed `GameSnapshot` - a malformed packet is silently ignored, not a crash, same convention every other decode function in this codebase follows. */
export function decodeSnapshot(raw: string): GameSnapshot | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const candidate = parsed as Record<string, unknown>;

  if (candidate.type !== 'debris-snapshot') return undefined;
  if (typeof candidate.tick !== 'number') return undefined;
  if (typeof candidate.nowMs !== 'number') return undefined;
  if (!Array.isArray(candidate.ships) || !candidate.ships.every(isShipSnapshot)) return undefined;

  return {
    type: 'debris-snapshot',
    tick: candidate.tick,
    nowMs: candidate.nowMs,
    ships: candidate.ships as ShipSnapshot[],
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
