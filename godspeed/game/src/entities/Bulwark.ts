import Phaser from 'phaser';
import type { Cell } from '../ai/Pathfinding';
import { BULWARK, COLORS } from '../config/GameConfig';
import type { Vector2 } from '../utilities/Vector2';
import { Enemy } from './Enemy';

/**
 * A "mini-boss": bigger and slower than a Drone, takes BULWARK.maxHits
 * projectile hits instead of one (Enemy's generic hitsRemaining/takeHit),
 * no ranged attack (that's what keeps it distinct from the real Boss).
 * Violet ring marks it as tougher-than-usual without being confused for
 * "the Boss," which reads as red + gold. Also "charges" (brief speed-up)
 * when it has a clear straight corridor to the player - see GameScene,
 * which drives Enemy.setSpeedBoost via ai/Pathfinding.ts's
 * hasClearCorridor on the shared repath tick.
 */
export class Bulwark extends Enemy {
  constructor(scene: Phaser.Scene, spawnCell: Cell, spawnPixel: Vector2, speedMultiplier = 1) {
    super(
      scene,
      spawnCell,
      spawnPixel,
      BULWARK.radius,
      COLORS.danger,
      BULWARK.speed * speedMultiplier,
      BULWARK.maxHits,
    );
    // Always a plain circle (no `visual` passed to super) - cast is safe.
    (this.sprite as Phaser.GameObjects.Arc).setStrokeStyle(3, COLORS.bulwarkRing);
  }
}
