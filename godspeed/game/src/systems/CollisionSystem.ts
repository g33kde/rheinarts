import type { Rect } from '../utilities/Rect';
import type { Vector2 } from '../utilities/Vector2';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function closestPointOnRect(position: Vector2, rect: Rect): Vector2 {
  return {
    x: clamp(position.x, rect.x, rect.x + rect.width),
    y: clamp(position.y, rect.y, rect.y + rect.height),
  };
}

export function circleIntersectsRect(position: Vector2, radius: number, rect: Rect): boolean {
  const closest = closestPointOnRect(position, rect);
  const dx = position.x - closest.x;
  const dy = position.y - closest.y;
  return dx * dx + dy * dy < radius * radius;
}

export function circleIntersectsAnyRect(
  position: Vector2,
  radius: number,
  rects: readonly Rect[],
): boolean {
  return rects.some((rect) => circleIntersectsRect(position, radius, rect));
}

/**
 * Pushes a circle out of a single overlapping rect along the shortest path.
 * Used for tile-based wall collision (see docs/level_design.md). Sequential,
 * not a full physics solver - good enough for arcade movement against a
 * grid of axis-aligned walls.
 */
export function resolveCircleRectCollision(position: Vector2, radius: number, rect: Rect): Vector2 {
  const closest = closestPointOnRect(position, rect);
  const dx = position.x - closest.x;
  const dy = position.y - closest.y;
  const distanceSquared = dx * dx + dy * dy;

  if (distanceSquared >= radius * radius) {
    return position;
  }

  if (distanceSquared === 0) {
    const pushLeft = position.x - rect.x;
    const pushRight = rect.x + rect.width - position.x;
    const pushUp = position.y - rect.y;
    const pushDown = rect.y + rect.height - position.y;
    const minPush = Math.min(pushLeft, pushRight, pushUp, pushDown);

    if (minPush === pushLeft) return { x: rect.x - radius, y: position.y };
    if (minPush === pushRight) return { x: rect.x + rect.width + radius, y: position.y };
    if (minPush === pushUp) return { x: position.x, y: rect.y - radius };
    return { x: position.x, y: rect.y + rect.height + radius };
  }

  const distance = Math.sqrt(distanceSquared);
  const overlap = radius - distance;
  return {
    x: position.x + (dx / distance) * overlap,
    y: position.y + (dy / distance) * overlap,
  };
}

export function circlesIntersect(
  positionA: Vector2,
  radiusA: number,
  positionB: Vector2,
  radiusB: number,
): boolean {
  const dx = positionA.x - positionB.x;
  const dy = positionA.y - positionB.y;
  const radiusSum = radiusA + radiusB;
  return dx * dx + dy * dy < radiusSum * radiusSum;
}

export function resolveCircleRectCollisions(
  position: Vector2,
  radius: number,
  rects: readonly Rect[],
): Vector2 {
  return rects.reduce<Vector2>(
    (current, rect) => resolveCircleRectCollision(current, radius, rect),
    position,
  );
}
