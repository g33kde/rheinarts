import type { Vector2 } from '../utilities/Vector2';

/**
 * One step of exponential position smoothing toward `target` for a
 * network client's visual mirror of a host-simulated position
 * (docs/roadmap.md's "Windows + LAN multiplayer," Sprint 15) - snapshots
 * arrive over an unreliable, unordered channel (`RtcConnection.ts`), so
 * consecutive frames can see slightly uneven gaps between updates even
 * on a healthy connection; moving only a fraction of the remaining
 * distance each frame smooths that jitter into a steady glide instead
 * of a visible stutter/snap.
 *
 * Snaps straight to `target` instead whenever the jump is big enough to
 * be a wrap (`systems/MovementSystem.ts`'s `wrapPosition` teleports an
 * entity to the opposite arena edge) rather than ordinary movement -
 * interpolating across one would streak the mirror clear across the
 * screen instead of reappearing on the far edge the way the real entity
 * does. Half the arena's own size is a safe threshold: nothing this
 * game's own speeds could cover in one network tick comes close to it,
 * while any genuine wrap necessarily exceeds it.
 */
export function smoothedPosition(
  current: Vector2,
  target: Vector2,
  arenaWidth: number,
  arenaHeight: number,
  smoothingFactor = 0.35,
): Vector2 {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  if (Math.abs(dx) > arenaWidth / 2 || Math.abs(dy) > arenaHeight / 2) {
    return { x: target.x, y: target.y };
  }
  return { x: current.x + dx * smoothingFactor, y: current.y + dy * smoothingFactor };
}
