import { describe, expect, it } from 'vitest';
import { chooseSpawnCells } from '../src/systems/PickupPlacement';

describe('chooseSpawnCells', () => {
  it('returns the requested number of distinct cells', () => {
    const cells = chooseSpawnCells(4, 5, [], 3, () => 0.5);
    expect(cells).toHaveLength(3);
    const keys = new Set(cells.map((c) => `${c.row},${c.col}`));
    expect(keys.size).toBe(3);
  });

  it('never returns an excluded cell', () => {
    const excluded = [
      { row: 0, col: 0 },
      { row: 1, col: 1 },
    ];
    const cells = chooseSpawnCells(3, 3, excluded, 7, () => 0.9);
    for (const cell of cells) {
      expect(excluded).not.toContainEqual(cell);
    }
  });

  it('clamps to the number of available (non-excluded) cells', () => {
    const allButOne = [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 0 },
    ];
    const cells = chooseSpawnCells(2, 2, allButOne, 5, () => 0.1);
    expect(cells).toEqual([{ row: 1, col: 1 }]);
  });

  it('is deterministic for a given rng', () => {
    const rng = () => 0.25;
    const a = chooseSpawnCells(3, 3, [], 4, rng);
    const b = chooseSpawnCells(3, 3, [], 4, rng);
    expect(a).toEqual(b);
  });
});
