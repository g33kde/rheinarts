export function canFire(lastFiredAtMs: number, nowMs: number, cooldownMs: number): boolean {
  return nowMs - lastFiredAtMs >= cooldownMs;
}
