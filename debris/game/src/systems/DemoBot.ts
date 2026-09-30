import type { Vector2 } from '../utilities/Vector2';

export interface BotIntent {
  turnDirection: -1 | 0 | 1;
  isThrusting: boolean;
  isFiring: boolean;
}

export interface BotTuning {
  /** Within this much heading error (radians) the bot considers itself on target and shoots. */
  fireToleranceRad: number;
  /** Below this heading error the bot stops correcting, so it doesn't jitter left/right forever around a perfect line. */
  aimDeadzoneRad: number;
  /** Further away than this and the bot closes the distance rather than sitting still - purely so an attract-mode ship looks alive rather than parked. */
  approachDistancePx: number;
  /** Closer than this and the bot thrusts regardless of aim, to break away from something about to hit it. */
  evadeDistancePx: number;
}

export const DEFAULT_BOT_TUNING: BotTuning = {
  fireToleranceRad: 0.18,
  aimDeadzoneRad: 0.05,
  approachDistancePx: 420,
  evadeDistancePx: 130,
};

/** Smallest signed angle from `from` to `to`, in (-pi, pi] - so "turn left or right?" is just its sign. */
export function shortestAngleDelta(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta <= -Math.PI) delta += Math.PI * 2;
  return delta;
}

/**
 * The attract-mode demo pilot (docs/roadmap.md's "attract mode") -
 * deliberately simple: turn toward the nearest thing, shoot it when
 * roughly lined up, thrust to close distance or to break away from
 * something too close. It is **not** trying to be good, and shouldn't
 * be: an attract loop needs to look alive and legible to someone
 * walking past, not to survive.
 *
 * Pure so it can be tested without a scene - the caller supplies the
 * ship's own position/heading and whatever targets are currently on
 * screen, and gets back the same three intents a human's input adapter
 * would produce (`input/PlayerInput.ts`).
 */
export function computeBotIntent(
  shipPosition: Vector2,
  shipHeadingRad: number,
  targets: readonly Vector2[],
  tuning: BotTuning = DEFAULT_BOT_TUNING,
): BotIntent {
  const nearest = nearestTarget(shipPosition, targets);
  if (!nearest) {
    // Nothing left to shoot - drift rather than spin on the spot.
    return { turnDirection: 0, isThrusting: false, isFiring: false };
  }

  const desiredHeading = Math.atan2(nearest.position.y - shipPosition.y, nearest.position.x - shipPosition.x);
  const error = shortestAngleDelta(shipHeadingRad, desiredHeading);
  const absError = Math.abs(error);

  const turnDirection: -1 | 0 | 1 = absError <= tuning.aimDeadzoneRad ? 0 : error > 0 ? 1 : -1;
  const isFiring = absError <= tuning.fireToleranceRad;
  // Thrust to close a long gap, or to get moving when something is
  // nearly on top of it - in both cases only while roughly facing where
  // it wants to go, so it never accelerates blindly backwards into
  // whatever it was trying to deal with.
  const wantsToClose = nearest.distance > tuning.approachDistancePx;
  const wantsToBreakAway = nearest.distance < tuning.evadeDistancePx;
  const isThrusting = (wantsToClose || wantsToBreakAway) && absError <= Math.PI / 2;

  return { turnDirection, isThrusting, isFiring };
}

function nearestTarget(
  from: Vector2,
  targets: readonly Vector2[],
): { position: Vector2; distance: number } | undefined {
  let best: { position: Vector2; distance: number } | undefined;
  for (const position of targets) {
    const distance = Math.hypot(position.x - from.x, position.y - from.y);
    if (!best || distance < best.distance) best = { position, distance };
  }
  return best;
}
