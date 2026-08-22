import type { Vector2 } from '../utilities/Vector2';

/**
 * Screen-wrap for a single axis: lets an entity travel fully offscreen
 * (past its own radius) before reappearing at the opposite edge, so it
 * exits one side and enters the other rather than popping/clipping at
 * the boundary. Applies to ships, asteroids, the UFO, and every
 * projectile per docs/gameplay.md - nothing in this game treats the
 * arena edges as walls.
 */
export function wrapAxis(position: number, radius: number, size: number): number {
  if (position < -radius) return size + radius;
  if (position > size + radius) return -radius;
  return position;
}

export function wrapPosition(position: Vector2, radius: number, width: number, height: number): Vector2 {
  return {
    x: wrapAxis(position.x, radius, width),
    y: wrapAxis(position.y, radius, height),
  };
}

/** Clamps a velocity vector to at most `maxSpeed`, preserving direction. */
export function clampSpeed(velocity: Vector2, maxSpeed: number): Vector2 {
  const speed = Math.hypot(velocity.x, velocity.y);
  if (speed <= maxSpeed || speed === 0) return velocity;
  const scale = maxSpeed / speed;
  return { x: velocity.x * scale, y: velocity.y * scale };
}
