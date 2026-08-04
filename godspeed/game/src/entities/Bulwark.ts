import Phaser from 'phaser';
import type { Cell } from '../ai/Pathfinding';
import { BULWARK, COLORS } from '../config/GameConfig';
import { applyHit, isGameOver } from '../systems/HealthSystem';
import type { Vector2 } from '../utilities/Vector2';
import { Enemy } from './Enemy';

/**
 * A "mini-boss": bigger and slower than a Drone, takes BULWARK.maxHits
 * projectile hits instead of one, no ranged attack (that's what keeps it
 * distinct from the real Boss). Violet ring marks it as tougher-than-usual
 * without being confused for "the Boss," which reads as red + gold.
 */
export class Bulwark extends Enemy {
  hitsRemaining: number;

  constructor(scene: Phaser.Scene, spawnCell: Cell, spawnPixel: Vector2, speedMultiplier = 1) {
    super(
      scene,
      spawnCell,
      spawnPixel,
      BULWARK.radius,
      COLORS.danger,
      BULWARK.speed * speedMultiplier,
    );
    this.hitsRemaining = BULWARK.maxHits;
    this.sprite.setStrokeStyle(3, COLORS.bulwarkRing);
  }

  takeHit(): void {
    this.hitsRemaining = applyHit(this.hitsRemaining);
    if (isGameOver(this.hitsRemaining)) {
      this.destroy();
    }
  }
}
