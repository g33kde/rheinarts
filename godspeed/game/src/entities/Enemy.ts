import Phaser from 'phaser';
import type { Cell } from '../ai/Pathfinding';
import { COLORS, ENEMY } from '../config/GameConfig';
import { computeNextPosition } from '../systems/MovementSystem';
import type { Vector2 } from '../utilities/Vector2';

/**
 * Moves cell-to-cell in a straight line toward a target pixel position
 * (a maze cell center) handed to it each step by GameScene's chase logic.
 * Snaps to the target instead of overshooting, so it never needs to
 * backtrack or jitter around arrival.
 *
 * radius/color/speed are constructor parameters (not always ENEMY.*)
 * specifically so Boss (see Boss.ts) can extend this with the same
 * movement behavior at a different size/color/pace, instead of
 * duplicating the movement code.
 */
export class Enemy {
  readonly sprite: Phaser.GameObjects.Arc;
  readonly radius: number;
  cell: Cell;
  private readonly speed: number;
  private targetPixel: Vector2;
  private alive = true;

  constructor(
    scene: Phaser.Scene,
    spawnCell: Cell,
    spawnPixel: Vector2,
    radius: number = ENEMY.radius,
    color: number = COLORS.danger,
    speed: number = ENEMY.speed,
  ) {
    this.sprite = scene.add.circle(spawnPixel.x, spawnPixel.y, radius, color);
    this.radius = radius;
    this.speed = speed;
    this.cell = spawnCell;
    this.targetPixel = spawnPixel;
  }

  get position(): Vector2 {
    return { x: this.sprite.x, y: this.sprite.y };
  }

  get isAlive(): boolean {
    return this.alive;
  }

  get hasArrived(): boolean {
    return this.position.x === this.targetPixel.x && this.position.y === this.targetPixel.y;
  }

  setTarget(cell: Cell, pixel: Vector2): void {
    this.cell = cell;
    this.targetPixel = pixel;
  }

  update(deltaSeconds: number): void {
    const current = this.position;
    const dx = this.targetPixel.x - current.x;
    const dy = this.targetPixel.y - current.y;
    const distance = Math.hypot(dx, dy);
    const step = this.speed * deltaSeconds;

    if (distance === 0) return;

    if (distance <= step) {
      this.sprite.setPosition(this.targetPixel.x, this.targetPixel.y);
      return;
    }

    const next = computeNextPosition(current, { x: dx, y: dy }, this.speed, deltaSeconds);
    this.sprite.setPosition(next.x, next.y);
  }

  destroy(): void {
    if (!this.alive) return;
    this.alive = false;
    this.sprite.destroy();
  }
}
