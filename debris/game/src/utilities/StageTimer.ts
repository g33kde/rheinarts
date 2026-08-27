/**
 * `MM:SS.mmm` for the dev-only stage timer (GameScene) - `65432` ->
 * `'01:05.432'`. No hour digit - stages are never remotely that long,
 * and this is a dev aid, not a full clock.
 */
export function formatStageTimer(elapsedMs: number): string {
  const totalMs = Math.max(0, Math.floor(elapsedMs));
  const minutes = Math.floor(totalMs / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  const millis = totalMs % 1000;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
}
