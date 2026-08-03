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
