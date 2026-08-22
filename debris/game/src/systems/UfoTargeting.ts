import type { Vector2 } from '../utilities/Vector2';

/**
 * "Rough lead on the nearest player," decided in docs/gameplay.md - a
 * single-pass prediction (aim where the target *will be* after the shot's
 * travel time, not just where it is now), not a full intercept solve.
 * That single-pass approximation is itself part of "rough," not a
 * shortcut standing in for something more precise.
 */
export function computeLeadAimHeading(
  shooterPos: Vector2,
  targetPos: Vector2,
  targetVelocity: Vector2,
  projectileSpeed: number,
): number {
  const distance = Math.hypot(targetPos.x - shooterPos.x, targetPos.y - shooterPos.y);
  const timeToHit = projectileSpeed > 0 ? distance / projectileSpeed : 0;
  const predictedX = targetPos.x + targetVelocity.x * timeToHit;
  const predictedY = targetPos.y + targetVelocity.y * timeToHit;
  return Math.atan2(predictedY - shooterPos.y, predictedX - shooterPos.x);
}

/** "Moderate spread," decided - a uniform-random error in [-spreadRad, +spreadRad] added to an otherwise-perfect lead. */
export function applyAimSpread(headingRad: number, spreadRad: number, rng: () => number = Math.random): number {
  return headingRad + (rng() * 2 - 1) * spreadRad;
}
