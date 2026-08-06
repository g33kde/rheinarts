import { normalize, type Vector2 } from '../utilities/Vector2';

/**
 * Pure movement rules, kept free of Phaser so they can be unit tested
 * without a rendering context (see docs/ai_development_guide.md - Testing).
 */

export function computeNextPosition(
  current: Vector2,
  rawDirection: Vector2,
  speed: number,
  deltaSeconds: number,
): Vector2 {
  const direction = normalize(rawDirection);
  return {
    x: current.x + direction.x * speed * deltaSeconds,
    y: current.y + direction.y * speed * deltaSeconds,
  };
}

export function clampToBounds(
  position: Vector2,
  radius: number,
  width: number,
  height: number,
): Vector2 {
  return {
    x: Math.min(Math.max(position.x, radius), width - radius),
    y: Math.min(Math.max(position.y, radius), height - radius),
  };
}

/** The velocity a controller is steering toward: raw input direction, scaled to speed. */
export function scaledVelocity(rawDirection: Vector2, speed: number): Vector2 {
  const direction = normalize(rawDirection);
  return { x: direction.x * speed, y: direction.y * speed };
}

/**
 * Moves `current` toward `target` by at most `accelerationPerSec2 *
 * deltaSeconds`, clamped so it never overshoots - used for velocity
 * smoothing (see entities/Player.ts) instead of snapping instantly to the
 * target speed/direction every frame.
 */
export function approachVelocity(
  current: Vector2,
  target: Vector2,
  accelerationPerSec2: number,
  deltaSeconds: number,
): Vector2 {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const distance = Math.hypot(dx, dy);
  const maxStep = accelerationPerSec2 * deltaSeconds;

  if (distance === 0 || distance <= maxStep) {
    return target;
  }

  return {
    x: current.x + (dx / distance) * maxStep,
    y: current.y + (dy / distance) * maxStep,
  };
}
