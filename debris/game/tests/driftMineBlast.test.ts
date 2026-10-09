import { describe, expect, it } from 'vitest';
import { isWithinBlast } from '../src/systems/DriftMineBlast';

const CENTER = { x: 500, y: 500 };
const BLAST_RADIUS = 150;

describe('isWithinBlast', () => {
  it('is true for something at the exact center', () => {
    expect(isWithinBlast(CENTER, CENTER, BLAST_RADIUS)).toBe(true);
  });

  it('is true for something just inside the radius', () => {
    const pos = { x: CENTER.x + BLAST_RADIUS - 1, y: CENTER.y };
    expect(isWithinBlast(pos, CENTER, BLAST_RADIUS)).toBe(true);
  });

  it('is true exactly on the boundary', () => {
    const pos = { x: CENTER.x + BLAST_RADIUS, y: CENTER.y };
    expect(isWithinBlast(pos, CENTER, BLAST_RADIUS)).toBe(true);
  });

  it('is false just outside the radius', () => {
    const pos = { x: CENTER.x + BLAST_RADIUS + 1, y: CENTER.y };
    expect(isWithinBlast(pos, CENTER, BLAST_RADIUS)).toBe(false);
  });

  it('is false far away', () => {
    const pos = { x: CENTER.x + 2000, y: CENTER.y + 2000 };
    expect(isWithinBlast(pos, CENTER, BLAST_RADIUS)).toBe(false);
  });
});
