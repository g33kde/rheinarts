import type { Vector2 } from '../utilities/Vector2';

/**
 * Procedural jagged-polygon asteroid shape, decided in
 * docs/art_direction.md: vertices placed evenly around a center with
 * per-vertex radius jitter (and slight angle jitter) for irregularity.
 * Angle order is preserved (each vertex's angle only increases) so the
 * shape never self-intersects, regardless of how extreme the jitter is.
 *
 * Pure and seedable via `rng` so it's deterministically testable - the
 * same algorithm confirmed live in the art-direction sample artifact,
 * ported as-is rather than re-derived.
 */
export function generateAsteroidPoints(
  vertexCount: number,
  jaggedness: number,
  rng: () => number = Math.random,
): Vector2[] {
  const points: Vector2[] = [];
  const baseAngleStep = (Math.PI * 2) / vertexCount;

  for (let i = 0; i < vertexCount; i += 1) {
    const angleJitter = (rng() - 0.5) * baseAngleStep * 0.4;
    const angle = i * baseAngleStep + angleJitter;
    const r = Math.max(0.25, 1 - jaggedness / 2 + rng() * jaggedness);
    points.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
  }

  return points;
}
