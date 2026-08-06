import { describe, expect, it } from 'vitest';
import { nextStepAway, nextStepToward } from '../src/ai/ChaseBehavior';
import { computeDistanceField, hasClearCorridor, openNeighbors } from '../src/ai/Pathfinding';
import type { Maze, MazeCell } from '../src/systems/MazeGenerator';

function cell(overrides: Partial<MazeCell> = {}): MazeCell {
  return { north: true, south: true, east: true, west: true, ...overrides };
}

describe('openNeighbors', () => {
  it('returns only cells reachable through an open wall', () => {
    const maze: Maze = {
      rows: 2,
      cols: 2,
      cells: [
        [cell({ east: false, south: false }), cell({ west: false })],
        [cell({ north: false }), cell()],
      ],
    };

    expect(openNeighbors(maze, { row: 0, col: 0 })).toEqual(
      expect.arrayContaining([
        { row: 0, col: 1 },
        { row: 1, col: 0 },
      ]),
    );
    expect(openNeighbors(maze, { row: 1, col: 1 })).toEqual([]);
  });
});

describe('computeDistanceField / nextStepToward', () => {
  it('gives increasing distance away from the target along a corridor', () => {
    const maze: Maze = {
      rows: 1,
      cols: 3,
      cells: [[cell({ east: false }), cell({ east: false, west: false }), cell({ west: false })]],
    };

    const distances = computeDistanceField(maze, { row: 0, col: 2 });
    expect(distances).toEqual([[2, 1, 0]]);

    expect(nextStepToward(maze, { row: 0, col: 0 }, distances)).toEqual({ row: 0, col: 1 });
    expect(nextStepToward(maze, { row: 0, col: 1 }, distances)).toEqual({ row: 0, col: 2 });
  });

  it('returns null once already at the target cell', () => {
    const maze: Maze = {
      rows: 1,
      cols: 3,
      cells: [[cell({ east: false }), cell({ east: false, west: false }), cell({ west: false })]],
    };
    const distances = computeDistanceField(maze, { row: 0, col: 2 });
    expect(nextStepToward(maze, { row: 0, col: 2 }, distances)).toBeNull();
  });

  it('leaves cells with no path to the target at infinite distance and returns no step', () => {
    const maze: Maze = {
      rows: 1,
      cols: 2,
      cells: [[cell(), cell()]], // no connection between the two cells
    };

    const distances = computeDistanceField(maze, { row: 0, col: 1 });
    expect(distances[0]![0]).toBe(Number.POSITIVE_INFINITY);
    expect(distances[0]![1]).toBe(0);
    expect(nextStepToward(maze, { row: 0, col: 0 }, distances)).toBeNull();
  });
});

describe('nextStepAway', () => {
  it('picks the neighbor that increases distance from the target', () => {
    const maze: Maze = {
      rows: 1,
      cols: 3,
      cells: [[cell({ east: false }), cell({ east: false, west: false }), cell({ west: false })]],
    };
    const distances = computeDistanceField(maze, { row: 0, col: 0 });

    expect(nextStepAway(maze, { row: 0, col: 1 }, distances)).toEqual({ row: 0, col: 2 });
  });

  it('returns null when cornered - no neighbor is farther from the target', () => {
    const maze: Maze = {
      rows: 1,
      cols: 2,
      cells: [[cell({ east: false }), cell({ west: false })]],
    };
    const distances = computeDistanceField(maze, { row: 0, col: 0 });

    // at col 1, the only neighbor (col 0) is *closer*, not farther
    expect(nextStepAway(maze, { row: 0, col: 1 }, distances)).toBeNull();
  });
});

describe('hasClearCorridor', () => {
  it('is true along an open straight row', () => {
    const maze: Maze = {
      rows: 1,
      cols: 3,
      cells: [[cell({ east: false }), cell({ east: false, west: false }), cell({ west: false })]],
    };
    expect(hasClearCorridor(maze, { row: 0, col: 0 }, { row: 0, col: 2 })).toBe(true);
    expect(hasClearCorridor(maze, { row: 0, col: 2 }, { row: 0, col: 0 })).toBe(true);
  });

  it('is true along an open straight column', () => {
    const maze: Maze = {
      rows: 3,
      cols: 1,
      cells: [[cell({ south: false })], [cell({ south: false, north: false })], [cell({ north: false })]],
    };
    expect(hasClearCorridor(maze, { row: 0, col: 0 }, { row: 2, col: 0 })).toBe(true);
  });

  it('is false when a wall blocks the straight line', () => {
    const maze: Maze = {
      rows: 1,
      cols: 3,
      // no connection carved between col 1 and col 2
      cells: [[cell({ east: false }), cell({ west: false }), cell()]],
    };
    expect(hasClearCorridor(maze, { row: 0, col: 0 }, { row: 0, col: 2 })).toBe(false);
  });

  it('is false for cells that are not row- or column-aligned', () => {
    const maze: Maze = {
      rows: 2,
      cols: 2,
      cells: [
        [cell({ east: false, south: false }), cell({ west: false })],
        [cell({ north: false }), cell()],
      ],
    };
    expect(hasClearCorridor(maze, { row: 0, col: 0 }, { row: 1, col: 1 })).toBe(false);
  });

  it('is false for the same cell', () => {
    const maze: Maze = { rows: 1, cols: 1, cells: [[cell()]] };
    expect(hasClearCorridor(maze, { row: 0, col: 0 }, { row: 0, col: 0 })).toBe(false);
  });
});
