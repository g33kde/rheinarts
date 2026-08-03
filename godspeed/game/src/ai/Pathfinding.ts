import type { Maze, WallSide } from '../systems/MazeGenerator';

export interface Cell {
  row: number;
  col: number;
}

const DIRECTIONS: readonly WallSide[] = ['north', 'south', 'east', 'west'];

function neighborCell(cell: Cell, side: WallSide): Cell {
  switch (side) {
    case 'north':
      return { row: cell.row - 1, col: cell.col };
    case 'south':
      return { row: cell.row + 1, col: cell.col };
    case 'east':
      return { row: cell.row, col: cell.col + 1 };
    case 'west':
      return { row: cell.row, col: cell.col - 1 };
  }
}

/** Cells reachable from `cell` through an open (non-walled) side. */
export function openNeighbors(maze: Maze, cell: Cell): Cell[] {
  const mazeCell = maze.cells[cell.row]?.[cell.col];
  if (!mazeCell) return [];
  return DIRECTIONS.filter((side) => !mazeCell[side]).map((side) => neighborCell(cell, side));
}

/**
 * Breadth-first distance-from-target field over every maze cell. Computed
 * once per repath interval and shared by all enemies, so each enemy just
 * looks up "which open neighbor is closer to the target" every step instead
 * of re-searching a path itself (see ai/ChaseBehavior.ts).
 */
export function computeDistanceField(maze: Maze, target: Cell): number[][] {
  const distances = Array.from({ length: maze.rows }, () =>
    Array<number>(maze.cols).fill(Number.POSITIVE_INFINITY),
  );
  distances[target.row]![target.col] = 0;

  const queue: Cell[] = [target];
  let head = 0;
  while (head < queue.length) {
    const current = queue[head]!;
    head += 1;
    const currentDistance = distances[current.row]![current.col]!;

    for (const neighbor of openNeighbors(maze, current)) {
      if (distances[neighbor.row]![neighbor.col]! > currentDistance + 1) {
        distances[neighbor.row]![neighbor.col] = currentDistance + 1;
        queue.push(neighbor);
      }
    }
  }

  return distances;
}
