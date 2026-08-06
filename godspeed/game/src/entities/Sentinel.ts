import Phaser from 'phaser';
import type { Cell } from '../ai/Pathfinding';
import { COLORS, SENTINEL } from '../config/GameConfig';
import type { Vector2 } from '../utilities/Vector2';
import { Enemy } from './Enemy';

/**
 * Parked and inert until the player wanders within `SENTINEL.triggerDistance`,
 * then behaves exactly like a Drone (chases via the same pathfinding).
 * Dimmed while dormant as a visual cue; full opacity once triggered.
 * Re-arms (goes back dormant) once the player has been past
 * `SENTINEL.rearmDistance` for `SENTINEL.rearmDelayMs` - a repeatable
 * ambush rather than a one-time trap.
 */
export class Sentinel extends Enemy {
  private active = false;
  private lastNearAtMs = -Infinity;

  constructor(scene: Phaser.Scene, spawnCell: Cell, spawnPixel: Vector2, speedMultiplier = 1) {
    super(
      scene,
      spawnCell,
      spawnPixel,
      SENTINEL.radius,
      COLORS.danger,
      SENTINEL.speed * speedMultiplier,
      SENTINEL.maxHits,
    );
    this.sprite.setAlpha(0.5);
  }

  get isActive(): boolean {
    return this.active;
  }

  updateAlertness(playerPosition: Vector2, nowMs: number): void {
    const dx = playerPosition.x - this.position.x;
    const dy = playerPosition.y - this.position.y;
    const distance = Math.hypot(dx, dy);

    if (distance <= SENTINEL.triggerDistance) {
      this.lastNearAtMs = nowMs;
      if (!this.active) {
        this.active = true;
        this.sprite.setAlpha(1);
      }
      return;
    }

    if (
      this.active &&
      distance >= SENTINEL.rearmDistance &&
      nowMs - this.lastNearAtMs >= SENTINEL.rearmDelayMs
    ) {
      this.active = false;
      this.sprite.setAlpha(0.5);
    }
  }
}
