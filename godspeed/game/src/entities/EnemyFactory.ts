import Phaser from 'phaser';
import type { Cell } from '../ai/Pathfinding';
import type { EnemyTypeName } from '../systems/FloorRoster';
import type { Vector2 } from '../utilities/Vector2';
import { Bulwark } from './Bulwark';
import { Drone } from './Drone';
import { Enemy } from './Enemy';
import { Seeker } from './Seeker';
import { Sentinel } from './Sentinel';
import { Skirmisher } from './Skirmisher';

/**
 * Builds the right Enemy subclass for a roster entry from FloorRoster.ts.
 * Every type now has its own class (even Drone/Seeker, previously plain
 * Enemy instances) since GameScene needs to tell them apart via
 * `instanceof` to drive their individual behaviors (lunge, faster repath,
 * charge, flee/sniper, ambush).
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
      return new Drone(scene, spawnCell, spawnPixel, speedMultiplier);
    case 'seeker':
      return new Seeker(scene, spawnCell, spawnPixel, speedMultiplier);
    case 'sentinel':
      return new Sentinel(scene, spawnCell, spawnPixel, speedMultiplier);
    case 'bulwark':
      return new Bulwark(scene, spawnCell, spawnPixel, speedMultiplier);
    case 'skirmisher':
      return new Skirmisher(scene, spawnCell, spawnPixel, speedMultiplier);
  }
}
