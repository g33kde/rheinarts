/**
 * Pure radius-over-time math for the aggressive Fragment's pulsing ring
 * (docs/roadmap.md) - telegraph (not yet lethal) -> expand (radius grows
 * linearly from 0 to maxRadius, lethal the whole time it's growing) ->
 * fade (holds at maxRadius, no longer lethal) -> gone. Separate from the
 * entity so the timing/growth curve is testable without a live Fragment.
 */
export type FractureRingPhase = 'telegraph' | 'expanding' | 'fading' | 'done';

export function ringPhaseAt(
  elapsedMs: number,
  telegraphMs: number,
  expandMs: number,
  fadeMs: number,
): FractureRingPhase {
  if (elapsedMs < telegraphMs) return 'telegraph';
  if (elapsedMs < telegraphMs + expandMs) return 'expanding';
  if (elapsedMs < telegraphMs + expandMs + fadeMs) return 'fading';
  return 'done';
}

/** Only defined while `ringPhaseAt` reports `'expanding'` - the ring is only ever lethal while actively growing, not during its telegraph or fade. */
export function ringLethalRadiusAt(
  elapsedMs: number,
  telegraphMs: number,
  expandMs: number,
  maxRadius: number,
): number | undefined {
  const sinceExpandStart = elapsedMs - telegraphMs;
  if (sinceExpandStart < 0 || sinceExpandStart >= expandMs) return undefined;
  return maxRadius * (sinceExpandStart / expandMs);
}
