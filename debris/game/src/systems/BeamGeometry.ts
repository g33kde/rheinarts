import { fromAngle, type Vector2 } from '../utilities/Vector2';

/**
 * Pure hit-test for The Fracture's laser beam (docs/roadmap.md) - a long
 * thin line, unlike every other hazard in this game (all circles). Not
 * Matter-backed at all: a rotated rectangle body would be a first for
 * this codebase and untestable without a live browser, so this is a
 * plain point-to-segment distance check instead, same "pure math hazard"
 * style `systems/BlackHoleGravity.ts` already uses.
 */
export function distanceToSegment(point: Vector2, segmentStart: Vector2, segmentEnd: Vector2): number {
  const segmentX = segmentEnd.x - segmentStart.x;
  const segmentY = segmentEnd.y - segmentStart.y;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;

  if (segmentLengthSquared === 0) {
    return Math.hypot(point.x - segmentStart.x, point.y - segmentStart.y);
  }

  const t = Math.max(
    0,
    Math.min(1, ((point.x - segmentStart.x) * segmentX + (point.y - segmentStart.y) * segmentY) / segmentLengthSquared),
  );
  const closestX = segmentStart.x + t * segmentX;
  const closestY = segmentStart.y + t * segmentY;
  return Math.hypot(point.x - closestX, point.y - closestY);
}

/**
 * `pointRadius` (default 0, fully backward compatible) - the target's own
 * physical size, not just its center coordinate. Without it, a target is
 * treated as a dimensionless point, which barely matters for a *static*
 * beam (a target sitting inside a lingering line has the whole active
 * window to register) but is a real bug for a *moving* one: The
 * Cardinal's laser keeps rotating throughout its firing window ("the
 * danger zone is a rotating cross, not a fixed one," per its own design
 * spec) rather than holding still like The Fracture's laser does, so the
 * lethal corridor sweeps past a ship-sized target in a fraction of a
 * frame unless the ship's own radius widens the check - point-only
 * hit-testing made it functionally impossible to hit a moving ship in
 * practice (a real bug found live: forcing the laser active against a
 * correctly-positioned, stationary ship in a controlled test did
 * register a hit, but normal play - a moving beam vs. a ship the player
 * is actively trying to keep moving too - essentially never did).
 */
export function isPointOnBeam(
  point: Vector2,
  origin: Vector2,
  angleRad: number,
  length: number,
  width: number,
  pointRadius = 0,
): boolean {
  const direction = fromAngle(angleRad);
  const end = { x: origin.x + direction.x * length, y: origin.y + direction.y * length };
  return distanceToSegment(point, origin, end) <= width / 2 + pointRadius;
}
