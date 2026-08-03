/**
 * Pure lives/invulnerability rules, kept free of Phaser so they can be unit
 * tested without a rendering context (see docs/ai_development_guide.md -
 * Testing).
 */

export function isInvulnerable(lastHitAtMs: number, nowMs: number, durationMs: number): boolean {
  return nowMs - lastHitAtMs < durationMs;
}

export function applyHit(lives: number): number {
  return Math.max(0, lives - 1);
}

export function grantExtraLife(lives: number): number {
  return lives + 1;
}

export function isGameOver(lives: number): boolean {
  return lives <= 0;
}
