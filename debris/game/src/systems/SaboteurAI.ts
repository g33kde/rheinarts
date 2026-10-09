import type { Vector2 } from '../utilities/Vector2';

/**
 * Pure Saboteur targeting/steering logic (docs/roadmap.md's Saboteur
 * entry, `SABOTEUR` config) - no Matter, no Phaser, same "pure rule
 * logic gets extracted and unit-tested" convention as
 * `BlackHoleGravity.ts`/`CommanderRescue.ts`.
 */

function distanceBetween(a: Vector2, b: Vector2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * The densest nearby asteroid cluster's center, or `undefined` if
 * nothing within `seekRadius` has at least `minNeighbors` others also
 * within `seekRadius` of itself - a lone drifting rock doesn't count as
 * a "cluster" worth seeding. Ties (equal neighbor counts) resolve to
 * whichever candidate is nearer the Saboteur itself, so it doesn't
 * cross the whole search radius to reach an equally-good target.
 */
export function findDenseClusterTarget(
  saboteurPos: Vector2,
  asteroidPositions: readonly Vector2[],
  seekRadius: number,
  minNeighbors: number,
): Vector2 | undefined {
  const candidates = asteroidPositions.filter((pos) => distanceBetween(saboteurPos, pos) <= seekRadius);

  let best: Vector2 | undefined;
  let bestNeighborCount = -1;
  let bestDistance = Infinity;

  for (const candidate of candidates) {
    const neighborCount = candidates.reduce(
      (count, other) => (other !== candidate && distanceBetween(candidate, other) <= seekRadius ? count + 1 : count),
      0,
    );
    if (neighborCount < minNeighbors) continue;

    const distance = distanceBetween(saboteurPos, candidate);
    if (neighborCount > bestNeighborCount || (neighborCount === bestNeighborCount && distance < bestDistance)) {
      best = candidate;
      bestNeighborCount = neighborCount;
      bestDistance = distance;
    }
  }

  return best;
}

/**
 * Targeting priority: an adrift Commander within `commanderPriorityRadius`
 * always wins over a cluster - "rescue is the real hook" (docs/vision.md),
 * so a mine seeded near a downed Commander turns the rescue route itself
 * into the danger, not just a race against the clock. Falling back to
 * the densest nearby cluster, and `undefined` if neither exists -
 * callers should just keep drifting straight in that case, same as the
 * Wanderer never steering at all.
 */
export function pickDropTarget(
  saboteurPos: Vector2,
  adriftCommanderPositions: readonly Vector2[],
  commanderPriorityRadius: number,
  asteroidPositions: readonly Vector2[],
  clusterSeekRadius: number,
  clusterMinNeighbors: number,
): Vector2 | undefined {
  let nearestCommander: Vector2 | undefined;
  let nearestCommanderDistance = Infinity;
  for (const pos of adriftCommanderPositions) {
    const distance = distanceBetween(saboteurPos, pos);
    if (distance <= commanderPriorityRadius && distance < nearestCommanderDistance) {
      nearestCommander = pos;
      nearestCommanderDistance = distance;
    }
  }
  if (nearestCommander) return nearestCommander;

  return findDenseClusterTarget(saboteurPos, asteroidPositions, clusterSeekRadius, clusterMinNeighbors);
}

/**
 * Turns `currentHeadingRad` toward `desiredHeadingRad` by at most
 * `maxTurnRadPerSec * deltaSeconds` - the capped, slow steering
 * `SABOTEUR.turnRateRadPerSec` is for: it can be out-turned, not
 * snapped past.
 */
export function turnToward(
  currentHeadingRad: number,
  desiredHeadingRad: number,
  maxTurnRadPerSec: number,
  deltaSeconds: number,
): number {
  const diff = ((desiredHeadingRad - currentHeadingRad + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  const maxStep = maxTurnRadPerSec * deltaSeconds;
  const step = Math.max(-maxStep, Math.min(maxStep, diff));
  return currentHeadingRad + step;
}
