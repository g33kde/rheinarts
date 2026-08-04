import Phaser from 'phaser';
import type { Cell } from '../ai/Pathfinding';
import { BOSS, COLORS } from '../config/GameConfig';
import { canFire } from '../systems/CombatSystem';
import { applyHit, isGameOver } from '../systems/HealthSystem';
import type { Vector2 } from '../utilities/Vector2';
import { Enemy } from './Enemy';

/**
 * The single v1 boss (roadmap item 6). Inherits Enemy's maze-aware chase
 * movement unchanged - a boss is still "a chaser," just bigger, tankier,
 * and additionally able to fire ranged projectiles at the player instead
 * of only damaging on touch.
 *
 * Reuses HealthSystem's applyHit/isGameOver for hit points rather than
 * duplicating "decrement, floor at zero, defeated at zero" under a new
 * name - the math is identical to player lives, just applied to a
 * different counter.
 *
 * maxHits/attackCooldownMs are constructor params (default to BOSS.*) so
 * FloorDifficulty.ts can scale the boss up on deeper floors without this
 * class needing to know anything about floors.
 */
export class Boss extends Enemy {
  hitsRemaining: number;
  private readonly attackCooldownMs: number;
  private lastAttackAtMs = -Infinity;

  constructor(
    scene: Phaser.Scene,
    spawnCell: Cell,
    spawnPixel: Vector2,
    maxHits: number = BOSS.maxHits,
    attackCooldownMs: number = BOSS.attackCooldownMs,
  ) {
    super(scene, spawnCell, spawnPixel, BOSS.radius, COLORS.danger, BOSS.speed);
    this.hitsRemaining = maxHits;
    this.attackCooldownMs = attackCooldownMs;
    this.sprite.setStrokeStyle(4, COLORS.projectile);
  }

  takeHit(): void {
    this.hitsRemaining = applyHit(this.hitsRemaining);
    if (isGameOver(this.hitsRemaining)) {
      this.destroy();
    }
  }

  canAttack(nowMs: number): boolean {
    return canFire(this.lastAttackAtMs, nowMs, this.attackCooldownMs);
  }

  recordAttack(nowMs: number): void {
    this.lastAttackAtMs = nowMs;
  }
}
