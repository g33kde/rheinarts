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

/** One silhouette profile - the same two knobs `generateAsteroidPoints` already takes, bundled so several can be picked between (`GameConfig.ts`'s `ASTEROID.shapeFamilies`). */
export interface AsteroidShapeFamily {
  readonly vertexCountRange: readonly [number, number];
  readonly jaggedness: number;
}

/**
 * Picks one of the given silhouette families - pure, seedable via `rng`,
 * same convention as `generateAsteroidPoints` itself. Landed as part of
 * docs/roadmap.md's polish-pass item ("more varied asteroid
 * silhouettes"), scoped via a live-rendered concept review +
 * `AskUserQuestion` before being built.
 */
export function pickShapeFamily<T extends AsteroidShapeFamily>(
  families: readonly T[],
  rng: () => number = Math.random,
): T {
  return families[Math.floor(rng() * families.length)]!;
}

/** A single procedural surface crater - normalized position/radius, same 0..1-ish scale `generateAsteroidPoints`' own output uses (the caller multiplies by the actual rock's radius at render time). */
export interface AsteroidCrater {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

/**
 * Procedurally places surface craters within a silhouette's own radius,
 * kept away from the jagged edge (`distance` capped below 1) so a crater
 * never pokes outside the rock's own outline regardless of jaggedness.
 * Pure/seedable, same convention as the rest of this file - part of
 * docs/roadmap.md's polish-pass item ("per-rock detail"), scoped via a
 * live-rendered concept review + `AskUserQuestion`.
 */
export function generateCraters(count: number, rng: () => number = Math.random): AsteroidCrater[] {
  const craters: AsteroidCrater[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = rng() * Math.PI * 2;
    const distance = rng() * 0.5;
    craters.push({
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      radius: 0.06 + rng() * 0.06,
    });
  }
  return craters;
}

/**
 * Which of a silhouette's own vertex indices (into the array
 * `generateAsteroidPoints` returned) get a crack line drawn from center -
 * reusing the silhouette's real vertices as crack endpoints (rather than
 * new independent geometry) means a crack always terminates exactly on
 * the rock's own jagged edge, never floating past or short of it.
 * Pure/seedable, same convention as the rest of this file.
 */
export function pickCrackTargets(pointCount: number, crackCount: number, rng: () => number = Math.random): number[] {
  const indices: number[] = [];
  for (let i = 0; i < crackCount; i += 1) {
    indices.push(Math.floor(rng() * pointCount));
  }
  return indices;
}
