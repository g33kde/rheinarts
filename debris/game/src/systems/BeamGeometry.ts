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

export function isPointOnBeam(
  point: Vector2,
  origin: Vector2,
  angleRad: number,
  length: number,
  width: number,
): boolean {
  const direction = fromAngle(angleRad);
  const end = { x: origin.x + direction.x * length, y: origin.y + direction.y * length };
  return distanceToSegment(point, origin, end) <= width / 2;
}
