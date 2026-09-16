/**
 * Pure hit-resolution rule for The Fracture (docs/roadmap.md), Debris's
 * first multi-hit enemy - everything else (asteroids, the UFO) dies in
 * one shot, so there's no existing hitsRemaining/takeHit convention to
 * reuse here. Deliberately tiny and separate from the entity itself, same
 * "pure rule logic gets extracted and unit-tested" convention as
 * `systems/BlackHoleGravity.ts`/`systems/CommanderRescue.ts`.
 *
 * `damage` defaults to 1 (every existing call site's implicit behavior,
 * unchanged) - the weapon upgrade system's Heavy Shot
 * (`systems/WeaponUpgrades.ts`) is the only thing that ever passes
 * something bigger, confirmed via `AskUserQuestion` to matter only
 * against multi-hit enemies like this one (asteroids/UFO die in one hit
 * regardless of damage, so Heavy Shot's bonus has nowhere else to go).
 */
export function applyHit(hitsRemaining: number, damage = 1): { hitsRemaining: number; destroyed: boolean } {
  const next = Math.max(0, hitsRemaining - damage);
  return { hitsRemaining: next, destroyed: next === 0 };
}
