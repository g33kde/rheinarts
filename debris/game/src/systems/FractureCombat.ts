/**
 * Pure hit-resolution rule for The Fracture (docs/roadmap.md), Debris's
 * first multi-hit enemy - everything else (asteroids, the UFO) dies in
 * one shot, so there's no existing hitsRemaining/takeHit convention to
 * reuse here. Deliberately tiny and separate from the entity itself, same
 * "pure rule logic gets extracted and unit-tested" convention as
 * `systems/BlackHoleGravity.ts`/`systems/CommanderRescue.ts`.
 */
export function applyHit(hitsRemaining: number): { hitsRemaining: number; destroyed: boolean } {
  const next = Math.max(0, hitsRemaining - 1);
  return { hitsRemaining: next, destroyed: next === 0 };
}
