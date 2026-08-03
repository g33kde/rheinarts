import type { Cell } from '../ai/Pathfinding';

function cellKey(cell: Cell): string {
  return `${cell.row},${cell.col}`;
}

/**
 * Picks up to `count` distinct cells, excluding any given in `exclude`
 * (e.g. the player/enemy spawn points), via a partial Fisher-Yates shuffle.
 * `rng` is injectable so tests can use a deterministic sequence.
 */
export function chooseSpawnCells(
  rows: number,
  cols: number,
  exclude: readonly Cell[],
  count: number,
  rng: () => number = Math.random,
): Cell[] {
  const excluded = new Set(exclude.map(cellKey));
  const candidates: Cell[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const cell = { row, col };
      if (!excluded.has(cellKey(cell))) candidates.push(cell);
    }
  }

  const take = Math.min(count, candidates.length);
  for (let i = 0; i < take; i += 1) {
    const j = i + Math.floor(rng() * (candidates.length - i));
    [candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!];
  }

  return candidates.slice(0, take);
}
