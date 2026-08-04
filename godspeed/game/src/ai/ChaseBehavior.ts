import type { Maze } from '../systems/MazeGenerator';
import { openNeighbors, type Cell } from './Pathfinding';

/**
 * Picks the open neighbor cell that strictly reduces distance to the
 * target, per a precomputed distance field (see computeDistanceField).
 * Returns null when already at the target cell or no closer neighbor
 * exists (e.g. the field hasn't reached this cell yet).
 */
export function nextStepToward(maze: Maze, from: Cell, distanceField: number[][]): Cell | null {
  const currentDistance = distanceField[from.row]?.[from.col];
  if (currentDistance === undefined || currentDistance === 0) {
    return null;
  }

  let best: Cell | null = null;
  let bestDistance = currentDistance;

  for (const neighbor of openNeighbors(maze, from)) {
    const neighborDistance = distanceField[neighbor.row]?.[neighbor.col];
    if (neighborDistance !== undefined && neighborDistance < bestDistance) {
      bestDistance = neighborDistance;
      best = neighbor;
    }
  }

  return best;
}

/**
 * Picks the open neighbor cell that strictly *increases* distance to the
 * target - used by Skirmisher (see entities/Skirmisher.ts) to back away
 * when the player gets close instead of closing in. Returns null when no
 * neighbor increases distance (e.g. cornered - nowhere farther to go).
 */
export function nextStepAway(maze: Maze, from: Cell, distanceField: number[][]): Cell | null {
  const currentDistance = distanceField[from.row]?.[from.col];
  if (currentDistance === undefined) {
    return null;
  }

  let best: Cell | null = null;
  let bestDistance = currentDistance;

  for (const neighbor of openNeighbors(maze, from)) {
    const neighborDistance = distanceField[neighbor.row]?.[neighbor.col];
    if (neighborDistance !== undefined && neighborDistance > bestDistance) {
      bestDistance = neighborDistance;
      best = neighbor;
    }
  }

  return best;
}
