import Phaser from 'phaser';
import type { Cell } from '../ai/Pathfinding';
import { COLORS, ENEMY, SEEKER } from '../config/GameConfig';
import type { EnemyTypeName } from '../systems/FloorRoster';
import type { Vector2 } from '../utilities/Vector2';
import { Bulwark } from './Bulwark';
import { Enemy } from './Enemy';
import { Sentinel } from './Sentinel';
import { Skirmisher } from './Skirmisher';

/**
 * Builds the right Enemy subclass (or a plain stat-variant Enemy) for a
 * roster entry from FloorRoster.ts. Drone and Seeker have no behavior of
 * their own - same chase logic as any Enemy, just different radius/speed -
 * so they're plain Enemy instances rather than needing dedicated classes.
 */
export function createEnemy(
  scene: Phaser.Scene,
  type: EnemyTypeName,
  spawnCell: Cell,
  spawnPixel: Vector2,
  speedMultiplier: number,
): Enemy {
  switch (type) {
    case 'drone':
      return new Enemy(
        scene,
        spawnCell,
        spawnPixel,
        ENEMY.radius,
        COLORS.danger,
        ENEMY.speed * speedMultiplier,
      );
    case 'seeker':
      return new Enemy(
        scene,
        spawnCell,
        spawnPixel,
        SEEKER.radius,
        COLORS.danger,
        SEEKER.speed * speedMultiplier,
      );
    case 'sentinel':
      return new Sentinel(scene, spawnCell, spawnPixel, speedMultiplier);
    case 'bulwark':
      return new Bulwark(scene, spawnCell, spawnPixel, speedMultiplier);
    case 'skirmisher':
      return new Skirmisher(scene, spawnCell, spawnPixel, speedMultiplier);
  }
}
