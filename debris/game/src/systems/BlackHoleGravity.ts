import { normalize, type Vector2 } from '../utilities/Vector2';

/**
 * Pure Gravity Well physics (docs/gameplay.md) - no Matter, no Phaser, so
 * the escapable-force/inescapable-capture/lethal-center rules are all
 * testable without a live body. Same "pure rule logic gets extracted and
 * unit-tested" convention as `systems/CommanderRescue.ts`.
 */

function distanceBetween(a: Vector2, b: Vector2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * The escapable outer band (`eventHorizonRadius` to `gravityRadius`) -
 * zero outside `gravityRadius` or once inside `eventHorizonRadius` (that
 * inner zone is `computeCaptureVelocity`'s job, not a force at all -
 * "once in the event horizon you cannot get out" isn't something a mere
 * force, counterable by enough thrust, can express). Linear falloff -
 * strongest right at the event horizon boundary, fading to nothing at
 * the outer edge.
 */
export function computeGravityForce(
  objectPos: Vector2,
  holePos: Vector2,
  gravityRadius: number,
  eventHorizonRadius: number,
  maxForce: number,
): Vector2 {
  const distance = distanceBetween(objectPos, holePos);
  if (distance >= gravityRadius || distance < eventHorizonRadius) {
    return { x: 0, y: 0 };
  }

  const strength = maxForce * (1 - distance / gravityRadius);
  const direction = normalize({ x: holePos.x - objectPos.x, y: holePos.y - objectPos.y });
  return { x: direction.x * strength, y: direction.y * strength };
}

export function isCaptured(objectPos: Vector2, holePos: Vector2, eventHorizonRadius: number): boolean {
  return distanceBetween(objectPos, holePos) < eventHorizonRadius;
}

export function isLethal(objectPos: Vector2, holePos: Vector2, lethalRadius: number): boolean {
  return distanceBetween(objectPos, holePos) < lethalRadius;
}

/**
 * The inescapable inner band - a direct velocity (not a force), since
 * nothing should be able to counteract it once captured. Speeds up the
 * closer the object gets to center, for a dramatic accelerating infall
 * rather than a constant crawl.
 */
export function computeCaptureVelocity(
  objectPos: Vector2,
  holePos: Vector2,
  eventHorizonRadius: number,
  baseSpeed: number,
  accelerationPerPx: number,
): Vector2 {
  const distance = distanceBetween(objectPos, holePos);
  const speed = baseSpeed + accelerationPerPx * Math.max(0, eventHorizonRadius - distance);
  const direction = normalize({ x: holePos.x - objectPos.x, y: holePos.y - objectPos.y });
  return { x: direction.x * speed, y: direction.y * speed };
}
