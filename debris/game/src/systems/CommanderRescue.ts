import { fromAngle, type Vector2 } from '../utilities/Vector2';

/** Same shape as CombatSystem.ts's canFire - a plain elapsed-time-vs-window check, pulled out so it's testable without a live Commander/Matter body. */
export function hasRescueWindowExpired(ejectedAtMs: number, nowMs: number, windowMs: number): boolean {
  return nowMs - ejectedAtMs >= windowMs;
}

/** Where a carried Commander should render: trailing behind the towing ship's current heading, not glued exactly on top of it (decided - see COMMANDER.towOffsetPx). */
export function computeTowPosition(carrierPosition: Vector2, carrierHeadingRad: number, offsetPx: number): Vector2 {
  const behind = fromAngle(carrierHeadingRad);
  return { x: carrierPosition.x - behind.x * offsetPx, y: carrierPosition.y - behind.y * offsetPx };
}

/** Plain Euclidean distance check - the space station has no Matter body at all (decided: trigger zone only), so drop-off detection is just this each frame. */
export function isWithinDropOffRange(shipPosition: Vector2, stationPosition: Vector2, dropOffRadius: number): boolean {
  const dx = shipPosition.x - stationPosition.x;
  const dy = shipPosition.y - stationPosition.y;
  return dx * dx + dy * dy <= dropOffRadius * dropOffRadius;
}
