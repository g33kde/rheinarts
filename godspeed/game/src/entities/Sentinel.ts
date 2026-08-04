import Phaser from 'phaser';
import type { Cell } from '../ai/Pathfinding';
import { COLORS, SENTINEL } from '../config/GameConfig';
import type { Vector2 } from '../utilities/Vector2';
import { Enemy } from './Enemy';

/**
 * Parked and inert until the player wanders within `SENTINEL.triggerDistance`,
 * then behaves exactly like a Drone (chases via the same pathfinding).
 * Dimmed while dormant as a visual cue; full opacity once triggered.
 */
export class Sentinel extends Enemy {
  private active = false;

  constructor(scene: Phaser.Scene, spawnCell: Cell, spawnPixel: Vector2, speedMultiplier = 1) {
    super(
      scene,
      spawnCell,
      spawnPixel,
      SENTINEL.radius,
      COLORS.danger,
      SENTINEL.speed * speedMultiplier,
    );
    this.sprite.setAlpha(0.5);
  }

  get isActive(): boolean {
    return this.active;
  }

  activateIfNear(playerPosition: Vector2, triggerDistance: number): void {
    if (this.active) return;
    const dx = playerPosition.x - this.position.x;
    const dy = playerPosition.y - this.position.y;
    if (Math.hypot(dx, dy) <= triggerDistance) {
      this.active = true;
      this.sprite.setAlpha(1);
    }
  }
}
