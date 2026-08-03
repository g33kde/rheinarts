import Phaser from 'phaser';
import { COLORS, MAZE } from '../config/GameConfig';
import {
  braidMaze,
  generateMaze,
  mazeToTileGrid,
  tileSegmentSize,
  type Maze,
} from '../systems/MazeGenerator';
import type { Cell } from '../ai/Pathfinding';
import type { Rect } from '../utilities/Rect';
import type { Vector2 } from '../utilities/Vector2';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Builds and renders a fresh procedural maze, and exposes the collidable
 * wall rects (see systems/CollisionSystem.ts), the underlying cell graph
 * for pathfinding (see ai/Pathfinding.ts), and pixel<->cell lookups needed
 * to place and navigate entities on it.
 */
export class MazeView {
  readonly maze: Maze;
  readonly wallRects: Rect[] = [];
  private readonly offsetX: number;
  private readonly offsetY: number;

  constructor(
    scene: Phaser.Scene,
    arenaWidth: number,
    arenaHeight: number,
    rng: () => number = Math.random,
    wallColor: number = COLORS.wall,
  ) {
    this.maze = braidMaze(generateMaze(MAZE.cols, MAZE.rows, rng), MAZE.braidChance, rng);
    const tileGrid = mazeToTileGrid(this.maze);
    const tileRows = tileGrid.length;
    const tileCols = tileGrid[0]?.length ?? 0;

    this.offsetX = (arenaWidth - tileCols * MAZE.tileSize) / 2;
    this.offsetY = (arenaHeight - tileRows * MAZE.tileSize) / 2;

    for (let row = 0; row < tileRows; row += 1) {
      for (let col = 0; col < tileCols; col += 1) {
        if (!tileGrid[row]![col]) continue;

        const centerX = this.offsetX + col * MAZE.tileSize + MAZE.tileSize / 2;
        const centerY = this.offsetY + row * MAZE.tileSize + MAZE.tileSize / 2;
        const { width, height } = tileSegmentSize(row, col, MAZE.tileSize, MAZE.wallThickness);

        const rect: Rect = { x: centerX - width / 2, y: centerY - height / 2, width, height };
        this.wallRects.push(rect);
        scene.add.rectangle(centerX, centerY, width, height, wallColor);
      }
    }
  }

  /** Pixel-space center of a maze cell (not a wall tile), for spawn/movement targets. */
  cellCenter(cellRow: number, cellCol: number): Vector2 {
    const tileRow = cellRow * 2 + 1;
    const tileCol = cellCol * 2 + 1;
    return {
      x: this.offsetX + tileCol * MAZE.tileSize + MAZE.tileSize / 2,
      y: this.offsetY + tileRow * MAZE.tileSize + MAZE.tileSize / 2,
    };
  }

  /** Nearest maze cell to a pixel-space position, clamped to the grid. */
  cellFromPosition(position: Vector2): Cell {
    const tileCol = Math.round((position.x - this.offsetX) / MAZE.tileSize - 0.5);
    const tileRow = Math.round((position.y - this.offsetY) / MAZE.tileSize - 0.5);
    return {
      row: clamp(Math.round((tileRow - 1) / 2), 0, MAZE.rows - 1),
      col: clamp(Math.round((tileCol - 1) / 2), 0, MAZE.cols - 1),
    };
  }
}
