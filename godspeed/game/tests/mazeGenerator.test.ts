import { describe, expect, it } from 'vitest';
import {
  braidMaze,
  generateMaze,
  mazeToTileGrid,
  tileSegmentSize,
  type Maze,
} from '../src/systems/MazeGenerator';

/** Deterministic LCG so maze layout is reproducible across test runs. */
function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function isFullyConnected(maze: Maze): boolean {
  const { rows, cols, cells } = maze;
  const visited = Array.from({ length: rows }, () => Array<boolean>(cols).fill(false));
  const stack: Array<{ row: number; col: number }> = [{ row: 0, col: 0 }];
  visited[0]![0] = true;
  let visitedCount = 0;

  while (stack.length > 0) {
    const { row, col } = stack.pop()!;
    visitedCount += 1;
    const cell = cells[row]![col]!;

    const candidates = [
      { open: !cell.north, row: row - 1, col },
      { open: !cell.south, row: row + 1, col },
      { open: !cell.east, row, col: col + 1 },
      { open: !cell.west, row, col: col - 1 },
    ];

    for (const candidate of candidates) {
      if (
        candidate.open &&
        candidate.row >= 0 &&
        candidate.row < rows &&
        candidate.col >= 0 &&
        candidate.col < cols &&
        !visited[candidate.row]![candidate.col]
      ) {
        visited[candidate.row]![candidate.col] = true;
        stack.push({ row: candidate.row, col: candidate.col });
      }
    }
  }

  return visitedCount === rows * cols;
}

describe('generateMaze', () => {
  it('produces a grid with the requested dimensions', () => {
    const maze = generateMaze(5, 4, seededRng(1));
    expect(maze.cells).toHaveLength(4);
    expect(maze.cells[0]).toHaveLength(5);
  });

  it('is fully connected: every cell is reachable from the start cell', () => {
    const maze = generateMaze(8, 6, seededRng(42));
    expect(isFullyConnected(maze)).toBe(true);
  });

  it('produces different layouts for different rng streams', () => {
    const a = generateMaze(6, 6, seededRng(1));
    const b = generateMaze(6, 6, seededRng(2));
    expect(a.cells).not.toEqual(b.cells);
  });
});

describe('braidMaze', () => {
  it('leaves the maze unchanged at extraConnectionChance 0, without mutating the input', () => {
    const maze = generateMaze(5, 5, seededRng(3));
    const before = JSON.parse(JSON.stringify(maze.cells));

    const braided = braidMaze(maze, 0, seededRng(9));
    expect(braided.cells).toEqual(before);
    expect(maze.cells).toEqual(before); // input untouched
  });

  it('opens every internal wall at extraConnectionChance 1, leaving only the border', () => {
    const maze = generateMaze(4, 3, seededRng(5));
    const braided = braidMaze(maze, 1, seededRng(11));

    for (let row = 0; row < braided.rows; row += 1) {
      for (let col = 0; col < braided.cols; col += 1) {
        const cell = braided.cells[row]![col]!;
        expect(cell.north).toBe(row === 0);
        expect(cell.south).toBe(row === braided.rows - 1);
        expect(cell.west).toBe(col === 0);
        expect(cell.east).toBe(col === braided.cols - 1);
      }
    }
  });

  it('never disconnects the maze - braiding only adds edges', () => {
    const maze = generateMaze(7, 6, seededRng(21));
    const braided = braidMaze(maze, 0.6, seededRng(22));
    expect(isFullyConnected(braided)).toBe(true);
  });
});

describe('tileSegmentSize', () => {
  it('is a thin square post at corners (even row, even col)', () => {
    expect(tileSegmentSize(0, 0, 40, 10)).toEqual({ width: 10, height: 10 });
    expect(tileSegmentSize(4, 6, 40, 10)).toEqual({ width: 10, height: 10 });
  });

  it('is a full-width, thin-height bar between vertically-adjacent cells (even row, odd col)', () => {
    expect(tileSegmentSize(2, 3, 40, 10)).toEqual({ width: 40, height: 10 });
  });

  it('is a thin-width, full-height bar between horizontally-adjacent cells (odd row, even col)', () => {
    expect(tileSegmentSize(3, 2, 40, 10)).toEqual({ width: 10, height: 40 });
  });
});

describe('mazeToTileGrid', () => {
  it('sizes the tile grid as 2n+1 in each dimension', () => {
    const maze = generateMaze(4, 3, seededRng(7));
    const grid = mazeToTileGrid(maze);
    expect(grid).toHaveLength(7); // rows*2+1
    expect(grid[0]).toHaveLength(9); // cols*2+1
  });

  it('always keeps cell centers as floor and the outer border as wall', () => {
    const maze = generateMaze(4, 3, seededRng(7));
    const grid = mazeToTileGrid(maze);

    for (let row = 0; row < maze.rows; row += 1) {
      for (let col = 0; col < maze.cols; col += 1) {
        expect(grid[row * 2 + 1]![col * 2 + 1]).toBe(false);
      }
    }

    const lastRow = grid.length - 1;
    const lastCol = grid[0]!.length - 1;
    for (let col = 0; col <= lastCol; col += 1) {
      expect(grid[0]![col]).toBe(true);
      expect(grid[lastRow]![col]).toBe(true);
    }
    for (let row = 0; row <= lastRow; row += 1) {
      expect(grid[row]![0]).toBe(true);
      expect(grid[row]![lastCol]).toBe(true);
    }
  });
});
