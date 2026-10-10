import { describe, expect, it } from 'vitest';
import { formatPlayerHud, type PlayerHudData } from '../src/systems/PlayerHudFormat';

const BASE: PlayerHudData = {
  slotIndex: 0,
  score: 100,
  lives: 2,
  comboMultiplier: 1,
  scrap: 0,
  statusLine: null,
};

describe('formatPlayerHud', () => {
  it('shows the player label, score, and life dots in competitive', () => {
    expect(formatPlayerHud('competitive', BASE, 3)).toBe('P1\nSCORE 100\n●●○');
  });

  it('shows the player label, score, and life dots in single player', () => {
    expect(formatPlayerHud('singlePlayer', BASE, 3)).toBe('P1\nSCORE 100\n●●○');
  });

  it('omits the combo line when the multiplier is 1', () => {
    expect(formatPlayerHud('competitive', BASE, 3)).not.toContain('COMBO');
  });

  it('shows the combo line once the multiplier exceeds 1', () => {
    const data = { ...BASE, comboMultiplier: 3 };
    expect(formatPlayerHud('competitive', data, 3)).toBe('P1\nSCORE 100\nx3 COMBO\n●●○');
  });

  it('replaces the life dots with the status line in cooperative', () => {
    const data = { ...BASE, statusLine: 'EJECTED' };
    expect(formatPlayerHud('cooperative', data, 3)).toBe('P1\nSCORE 100\nEJECTED');
  });

  it('omits the third line entirely in cooperative when there is no status', () => {
    expect(formatPlayerHud('cooperative', BASE, 3)).toBe('P1\nSCORE 100');
  });

  it('omits the scrap line when scrap is 0 and shows it once positive', () => {
    expect(formatPlayerHud('competitive', BASE, 3)).not.toContain('SCRAP');
    const data = { ...BASE, scrap: 4 };
    expect(formatPlayerHud('competitive', data, 3)).toBe('P1\nSCORE 100\n●●○\nSCRAP 4');
  });

  it('clamps the filled-dot count at zero rather than going negative', () => {
    const data = { ...BASE, lives: -1 };
    expect(formatPlayerHud('competitive', data, 3)).toBe('P1\nSCORE 100\n○○○○');
  });
});
