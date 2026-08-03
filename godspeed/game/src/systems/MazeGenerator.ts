export type WallSide = 'north' | 'south' | 'east' | 'west';

export interface MazeCell {
  north: boolean;
  south: boolean;
  east: boolean;
  west: boolean;
}

export interface Maze {
  readonly cols: number;
  readonly rows: number;
  readonly cells: readonly (readonly MazeCell[])[];
}

/** true = wall tile, false = floor tile. Grid is (rows*2+1) x (cols*2+1). */
export type TileGrid = readonly (readonly boolean[])[];

const OPPOSITE: Record<WallSide, WallSide> = {
  north: 'south',
  south: 'north',
  east: 'west',
  west: 'east',
};

interface Neighbor {
  side: WallSide;
  row: number;
  col: number;
}

function neighborsOf(row: number, col: number, cols: number, rows: number): Neighbor[] {
  const candidates: Neighbor[] = [
    { side: 'north', row: row - 1, col },
    { side: 'south', row: row + 1, col },
    { side: 'east', row, col: col + 1 },
    { side: 'west', row, col: col - 1 },
  ];
  return candidates.filter((n) => n.row >= 0 && n.row < rows && n.col >= 0 && n.col < cols);
}

/**
 * Generates a "perfect" maze (every cell reachable, no loops) with an
 * iterative randomized depth-first backtracker. `rng` is injectable so tests
 * can use a deterministic sequence instead of Math.random.
 */
export function generateMaze(cols: number, rows: number, rng: () => number = Math.random): Maze {
  const cells: MazeCell[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ north: true, south: true, east: true, west: true })),
  );
  const visited: boolean[][] = Array.from({ length: rows }, () => Array<boolean>(cols).fill(false));

  const stack: Array<{ row: number; col: number }> = [{ row: 0, col: 0 }];
  visited[0]![0] = true;

  while (stack.length > 0) {
    const current = stack[stack.length - 1]!;
    const unvisited = neighborsOf(current.row, current.col, cols, rows).filter(
      (n) => !visited[n.row]![n.col],
    );

    if (unvisited.length === 0) {
      stack.pop();
      continue;
    }

    const next = unvisited[Math.floor(rng() * unvisited.length)]!;
    cells[current.row]![current.col]![next.side] = false;
    cells[next.row]![next.col]![OPPOSITE[next.side]] = false;
    visited[next.row]![next.col] = true;
    stack.push({ row: next.row, col: next.col });
  }

  return { cols, rows, cells };
}

/**
 * Knocks down additional walls in an already-generated (perfect) maze to
 * introduce loops and open rooms - a plain `generateMaze` output is a
 * spanning tree: exactly one path between any two cells, and guaranteed
 * dead ends everywhere. That reads as a single-corridor labyrinth, not the
 * open, multi-route arena feel of the source material (see
 * docs/level_design.md). For each internal wall, independently removes it
 * with probability `extraConnectionChance`. Returns a new Maze; does not
 * mutate the input.
 */
export function braidMaze(
  maze: Maze,
  extraConnectionChance: number,
  rng: () => number = Math.random,
): Maze {
  const cells: MazeCell[][] = maze.cells.map((row) => row.map((cell) => ({ ...cell })));

  for (let row = 0; row < maze.rows; row += 1) {
    for (let col = 0; col < maze.cols; col += 1) {
      if (row + 1 < maze.rows && cells[row]![col]!.south && rng() < extraConnectionChance) {
        cells[row]![col]!.south = false;
        cells[row + 1]![col]!.north = false;
      }
      if (col + 1 < maze.cols && cells[row]![col]!.east && rng() < extraConnectionChance) {
        cells[row]![col]!.east = false;
        cells[row]![col + 1]!.west = false;
      }
    }
  }

  return { cols: maze.cols, rows: maze.rows, cells };
}

export interface TileSegmentSize {
  width: number;
  height: number;
}

/**
 * Thin bar/post dimensions for a blocked tile at (row, col) in a TileGrid,
 * so walls render and collide as thin segments instead of solid
 * tileSize-square blocks (the player already moves freely between cells;
 * a full-size wall block reads as much thicker than it needs to be).
 * Based on tile parity: even row/even col = a corner post where up to
 * four wall segments could meet; even row/odd col = a horizontal bar
 * (the wall between two vertically-adjacent cells); odd row/even col = a
 * vertical bar. Odd/odd tiles are always floor (never blocked) and have
 * no meaning here.
 */
export function tileSegmentSize(
  row: number,
  col: number,
  tileSize: number,
  wallThickness: number,
): TileSegmentSize {
  const rowIsEven = row % 2 === 0;
  const colIsEven = col % 2 === 0;

  if (rowIsEven && colIsEven) {
    return { width: wallThickness, height: wallThickness };
  }
  if (rowIsEven) {
    return { width: tileSize, height: wallThickness };
  }
  return { width: wallThickness, height: tileSize };
}

/**
 * Converts the cell/wall graph into a uniform tile grid, doubling resolution
 * so both cell centers and the walls between them become individual tiles.
 * This keeps rendering and collision as plain axis-aligned rectangles.
 */
export function mazeToTileGrid(maze: Maze): TileGrid {
  const tileRows = maze.rows * 2 + 1;
  const tileCols = maze.cols * 2 + 1;
  const grid: boolean[][] = Array.from({ length: tileRows }, () =>
    Array<boolean>(tileCols).fill(true),
  );

  for (let row = 0; row < maze.rows; row += 1) {
    for (let col = 0; col < maze.cols; col += 1) {
      const cell = maze.cells[row]![col]!;
      const tileRow = row * 2 + 1;
      const tileCol = col * 2 + 1;

      grid[tileRow]![tileCol] = false;
      if (!cell.north) grid[tileRow - 1]![tileCol] = false;
      if (!cell.south) grid[tileRow + 1]![tileCol] = false;
      if (!cell.west) grid[tileRow]![tileCol - 1] = false;
      if (!cell.east) grid[tileRow]![tileCol + 1] = false;
    }
  }

  return grid;
}
