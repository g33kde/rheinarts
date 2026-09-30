import type { Vector2 } from '../utilities/Vector2';

/**
 * The ship-to-ship tether (docs/roadmap.md's "v2 candidates") - an
 * elastic link between two Cooperative ships. Sling a teammate clear of
 * a Gravity Well, whip them toward a downed pilot, or drag them
 * somewhere they very much did not want to go. *Lovers in a Dangerous
 * Spacetime* is the reference: the coordination failures are as much
 * the point as the successes.
 *
 * **Cooperative only, decided.** Tethering an *enemy* in Competitive is
 * a genuinely great idea and a balance nightmare - being physically
 * dragged by an opponent with no way to refuse it is a different game,
 * and one that wants its own design pass rather than arriving as a side
 * effect of this one.
 *
 * **Attaches and breaks on its own, decided**, rather than on a button:
 * every one of the four verbs (turn/thrust/fire/hyperspace) is already
 * bound, and a fifth would crowd both keyboard zones. Proximity forms
 * it, overstretching snaps it - which also means the tether is
 * something that *happens to* a crew flying close together, not a
 * resource they manage.
 *
 * Pure math, no Phaser - same convention as `BlackHoleGravity.ts`,
 * whose escapable-force shape this deliberately echoes.
 */
export interface TetherConfig {
  /** Two untethered ships closer than this link up. */
  readonly attachDistancePx: number;
  /** No force at all inside this - a tether only pulls once it's actually taut, so flying close together never feels sticky. */
  readonly restLengthPx: number;
  /** Stretch it past this and it snaps. */
  readonly breakDistancePx: number;
  /** Force per pixel of stretch beyond rest length. */
  readonly stiffness: number;
  /** Ceiling on the spring force, so a near-breaking tether can't fling a ship across the arena. */
  readonly maxForce: number;
}

export function distanceBetween(a: Vector2, b: Vector2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Two *untethered* ships this close link up. Deliberately much shorter than breakDistancePx, so a tether that just snapped doesn't immediately re-form. */
export function shouldAttach(distance: number, config: TetherConfig): boolean {
  return distance <= config.attachDistancePx;
}

export function shouldBreak(distance: number, config: TetherConfig): boolean {
  return distance > config.breakDistancePx;
}

/**
 * Spring force pulling `from` toward `to`. Zero inside the rest length -
 * a tether pulls, it never pushes, so a pair drifting close together is
 * completely unaffected until the line goes taut.
 *
 * The caller applies the equal and opposite force to the other ship
 * (`negate`), so neither end is privileged: a heavy burn by one player
 * drags the other, which is the whole mechanic.
 */
export function computeTetherForce(from: Vector2, to: Vector2, config: TetherConfig): Vector2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= config.restLengthPx || distance === 0) return { x: 0, y: 0 };

  const stretch = distance - config.restLengthPx;
  const magnitude = Math.min(config.maxForce, stretch * config.stiffness);
  return { x: (dx / distance) * magnitude, y: (dy / distance) * magnitude };
}

/** 0 at rest, 1 at the breaking point - drives how hard the drawn line reads, so players can see a tether about to snap. */
export function tetherTension(distance: number, config: TetherConfig): number {
  const span = config.breakDistancePx - config.restLengthPx;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (distance - config.restLengthPx) / span));
}
