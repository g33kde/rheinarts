import type { Vector2 } from '../utilities/Vector2';

/**
 * Pure Drift Mine detonation math (`DRIFT_MINE` config) - no Matter, no
 * Phaser, same convention as `BlackHoleGravity.ts`. Resolution is
 * instant-radius rather than a simulated expanding shockwave: the
 * mockup's shockwave animation is a visual flourish
 * (`entities/DriftMine.ts` owns that), but *what* gets caught is decided
 * the instant a detonation happens, not frame-by-frame as a visual ring
 * grows - simpler, and no less fair since the blast radius is drawn at
 * all times anyway (the telegraph), not just during the explosion.
 */
export function isWithinBlast(position: Vector2, blastCenter: Vector2, blastRadius: number): boolean {
  return Math.hypot(position.x - blastCenter.x, position.y - blastCenter.y) <= blastRadius;
}
