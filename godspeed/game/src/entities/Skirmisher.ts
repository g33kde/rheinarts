import Phaser from 'phaser';
import type { Cell } from '../ai/Pathfinding';
import { COLORS, SKIRMISHER } from '../config/GameConfig';
import { canFire } from '../systems/CombatSystem';
import type { Vector2 } from '../utilities/Vector2';
import { Enemy } from './Enemy';

/**
 * Backs away when the player closes to within SKIRMISHER.fleeDistance,
 * chases normally otherwise - a "hit and run" enemy that's harder to
 * corner. The actual flee-vs-chase path choice happens in GameScene (it
 * already has the precomputed distance field this needs); shouldFlee()
 * just answers the one question specific to this entity. Marked with a
 * green stroke ring (COLORS.skirmisherRing) so it reads as distinct from
 * Bulwark's violet ring and the Boss's gold one at a glance. Only appears
 * from floor 5 onward - see systems/FloorRoster.ts.
 *
 * shouldFlee() has hysteresis (won't resume chasing until past
 * SKIRMISHER.reengageDistance, not just past fleeDistance again) - a plain
 * distance threshold made it flicker direction for a player parked right
 * at the boundary. It's also the one enemy with a ranged attack besides
 * the Boss: a fast "sniper" shot the instant it has a clear line of sight
 * to the player (GameScene checks CollisionSystem.ts's hasLineOfSight - a
 * real pixel-space raycast, not the maze cell grid - and calls
 * canFireSniper/recordSniperFired), independent of whether it's currently
 * fleeing or chasing - the actual "hit" in "hit and run," previously it
 * was all run, no hit.
 */
export class Skirmisher extends Enemy {
  private fleeing = false;
  private lastSniperAtMs = -Infinity;

  constructor(scene: Phaser.Scene, spawnCell: Cell, spawnPixel: Vector2, speedMultiplier = 1) {
    super(
      scene,
      spawnCell,
      spawnPixel,
      SKIRMISHER.radius,
      COLORS.danger,
      SKIRMISHER.speed * speedMultiplier,
      SKIRMISHER.maxHits,
    );
    // Always a plain circle (no `visual` passed to super) - cast is safe.
    (this.sprite as Phaser.GameObjects.Arc).setStrokeStyle(3, COLORS.skirmisherRing);
  }

  shouldFlee(playerPosition: Vector2): boolean {
    const dx = playerPosition.x - this.position.x;
    const dy = playerPosition.y - this.position.y;
    const distance = Math.hypot(dx, dy);

    if (this.fleeing) {
      if (distance > SKIRMISHER.reengageDistance) this.fleeing = false;
    } else if (distance <= SKIRMISHER.fleeDistance) {
      this.fleeing = true;
    }

    return this.fleeing;
  }

  canFireSniper(nowMs: number): boolean {
    return canFire(this.lastSniperAtMs, nowMs, SKIRMISHER.sniperCooldownMs);
  }

  recordSniperFired(nowMs: number): void {
    this.lastSniperAtMs = nowMs;
  }
}
