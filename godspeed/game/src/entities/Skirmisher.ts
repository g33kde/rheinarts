import Phaser from 'phaser';
import type { Cell } from '../ai/Pathfinding';
import { COLORS, SKIRMISHER } from '../config/GameConfig';
import type { Vector2 } from '../utilities/Vector2';
import { Enemy } from './Enemy';

/**
 * Backs away when the player closes to within SKIRMISHER.fleeDistance,
 * chases normally otherwise - a "hit and run" enemy that's harder to
 * corner. The actual flee-vs-chase path choice happens in GameScene (it
 * already has the precomputed distance field this needs); shouldFlee()
 * just answers the one question specific to this entity.
 */
export class Skirmisher extends Enemy {
  constructor(scene: Phaser.Scene, spawnCell: Cell, spawnPixel: Vector2, speedMultiplier = 1) {
    super(
      scene,
      spawnCell,
      spawnPixel,
      SKIRMISHER.radius,
      COLORS.danger,
      SKIRMISHER.speed * speedMultiplier,
    );
  }

  shouldFlee(playerPosition: Vector2): boolean {
    const dx = playerPosition.x - this.position.x;
    const dy = playerPosition.y - this.position.y;
    return Math.hypot(dx, dy) <= SKIRMISHER.fleeDistance;
  }
}
