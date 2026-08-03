import { normalize, type Vector2 } from '../utilities/Vector2';

/**
 * Pure combat rules, kept free of Phaser so they can be unit tested
 * without a rendering context (see docs/ai_development_guide.md - Testing).
 */

export function canFire(lastFiredAtMs: number, nowMs: number, cooldownMs: number): boolean {
  return nowMs - lastFiredAtMs >= cooldownMs;
}

export function projectileVelocity(aimDirection: Vector2, speed: number): Vector2 {
  const direction = normalize(aimDirection);
  return { x: direction.x * speed, y: direction.y * speed };
}

export function isExpired(spawnedAtMs: number, nowMs: number, lifetimeMs: number): boolean {
  return nowMs - spawnedAtMs >= lifetimeMs;
}
