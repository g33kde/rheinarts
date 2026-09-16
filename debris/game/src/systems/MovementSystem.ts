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

/**
 * Bleeds off speed above `baseSpeed`, preserving direction - the fix for
 * a real bug: a Gravity Well's outer-band pull (docs/gameplay.md) is a
 * continuous applied force with no ceiling of its own (unlike a ship,
 * which clamps to `SHIP.maxSpeed` every frame via `clampSpeed` above, an
 * asteroid has no speed cap at all), and asteroids have zero air
 * friction by design - so a rock pulled by a Black Hole (or a Fracture
 * gravity Fragment, `systems/BlackHoleGravity.ts`'s force math reused
 * directly there) stayed at whatever inflated speed it picked up
 * *permanently*, well past the hazard's own despawn, reported directly
 * as "too fast to shoot." Confirmed via `AskUserQuestion`: rather than
 * capping the pull itself (leaving the in-the-moment acceleration
 * dramatic, since that part wasn't the actual complaint), this decays
 * any excess back to normal only once the object is clear of every
 * active gravity source, at a fixed rate - GameScene calls this only
 * for asteroids not currently being pulled by anything this frame. A
 * no-op at or below `baseSpeed`, and never decays below it either.
 */
export function decayExcessSpeed(velocity: Vector2, baseSpeed: number, decayPerSecond: number, deltaSeconds: number): Vector2 {
  const speed = Math.hypot(velocity.x, velocity.y);
  if (speed <= baseSpeed) return velocity;
  const next = Math.max(baseSpeed, speed - decayPerSecond * deltaSeconds);
  const scale = next / speed;
  return { x: velocity.x * scale, y: velocity.y * scale };
}
