/**
 * Pure hit-resolution + phase rules for The Cardinal (docs/roadmap.md).
 * A separate module from `FractureCombat.ts` even though the actual hit
 * math is identical (decrement by one, destroyed at zero) - each boss
 * gets its own small combat module rather than one importing the
 * other's file, same "pure rule logic gets extracted and unit-tested"
 * convention as `systems/BlackHoleGravity.ts`/`systems/CommanderRescue.ts`.
 */
export function applyHit(hp: number): { hp: number; destroyed: boolean } {
  const next = Math.max(0, hp - 1);
  return { hp: next, destroyed: next === 0 };
}

export type CardinalPhase = 'armed' | 'coreExposed' | 'critical';

/**
 * "Steadily disarms itself," decided - the three-phase fight shape:
 * `armed` while any arm still has HP, `coreExposed` once every arm is
 * destroyed but the core hasn't been, `critical` once the core is too
 * (the 5-second detonation countdown). `coreDestroyed` always wins over
 * arm state - a core that's already gone stays `critical` regardless of
 * what `armsAlive` reports (it's frozen at all-dead by that point
 * anyway, but this doesn't rely on that).
 */
export function determinePhase(armsAlive: readonly boolean[], coreDestroyed: boolean): CardinalPhase {
  if (coreDestroyed) return 'critical';
  if (armsAlive.some((alive) => alive)) return 'armed';
  return 'coreExposed';
}
