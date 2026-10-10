import type { GameMode } from './RoundOutcome';

/**
 * Pure formatting for one player's corner HUD text (`GameScene.ts`'s
 * `refreshAllPlayerHud`) - pulled out so the exact same logic can run
 * host-side (from live `PlayerSlot` state) and client-side (from a
 * `PlayerHudSnapshot` the host broadcast, docs/roadmap.md's "Windows +
 * LAN multiplayer," Sprint 10) without the two ever drifting apart.
 */
export interface PlayerHudData {
  readonly slotIndex: number;
  readonly score: number;
  readonly lives: number;
  readonly comboMultiplier: number;
  readonly scrap: number;
  /** Cooperative-only third line (e.g. "EJECTED"/"INBOUND"/"ELIMINATED") - null when there's nothing worth showing, or whenever `mode` isn't Cooperative at all. */
  readonly statusLine: string | null;
}

export function formatPlayerHud(mode: GameMode, data: PlayerHudData, livesPerPlayer: number): string {
  const lines = [`P${data.slotIndex + 1}`, `SCORE ${data.score}`];

  if (data.comboMultiplier > 1) lines.push(`x${data.comboMultiplier} COMBO`);

  if (mode === 'cooperative') {
    if (data.statusLine) lines.push(data.statusLine);
  } else {
    const filled = '●'.repeat(Math.max(0, data.lives));
    const hollow = '○'.repeat(Math.max(0, livesPerPlayer - data.lives));
    lines.push(`${filled}${hollow}`);
  }

  if (data.scrap > 0) lines.push(`SCRAP ${data.scrap}`);

  return lines.join('\n');
}
