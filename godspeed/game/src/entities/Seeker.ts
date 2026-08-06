import Phaser from 'phaser';
import type { Cell } from '../ai/Pathfinding';
import { COLORS, SEEKER } from '../config/GameConfig';
import type { Vector2 } from '../utilities/Vector2';
import { Enemy } from './Enemy';

/**
 * Smaller and faster than a Drone, and unlike every other type retargets
 * on its own tighter cadence (SEEKER.pathUpdateIntervalMs, driven from
 * GameScene with a dedicated repath timer) instead of the shared 300ms
 * tick - reads as twitchy/relentless rather than just "a fast Drone."
 */
export class Seeker extends Enemy {
  constructor(scene: Phaser.Scene, spawnCell: Cell, spawnPixel: Vector2, speedMultiplier = 1) {
    super(
      scene,
      spawnCell,
      spawnPixel,
      SEEKER.radius,
      COLORS.danger,
      SEEKER.speed * speedMultiplier,
      SEEKER.maxHits,
    );
  }
}
