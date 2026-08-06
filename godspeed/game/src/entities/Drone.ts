import Phaser from 'phaser';
import type { Cell } from '../ai/Pathfinding';
import { COLORS, ENEMY } from '../config/GameConfig';
import type { Vector2 } from '../utilities/Vector2';
import { Enemy } from './Enemy';

/**
 * The baseline chaser - no gimmick beyond a brief "lunge" (speed-up) when
 * it has a clear straight corridor to the player (see
 * ai/Pathfinding.ts's hasClearCorridor), so it isn't completely inert next
 * to the other four types. GameScene drives the lunge check via
 * setSpeedBoost on the shared repath tick; this class just needs to exist
 * so GameScene can tell a Drone apart from a Seeker (both were previously
 * plain Enemy instances).
 */
export class Drone extends Enemy {
  constructor(scene: Phaser.Scene, spawnCell: Cell, spawnPixel: Vector2, speedMultiplier = 1) {
    super(
      scene,
      spawnCell,
      spawnPixel,
      ENEMY.radius,
      COLORS.danger,
      ENEMY.speed * speedMultiplier,
      ENEMY.maxHits,
    );
  }
}
