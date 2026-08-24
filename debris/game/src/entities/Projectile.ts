import Phaser from 'phaser';
import { PROJECTILE } from '../config/GameConfig';
import { CATEGORY } from '../systems/CollisionCategories';
import { wrapPosition } from '../systems/MovementSystem';
import type { Vector2 } from '../utilities/Vector2';
import type { MatterGameObject } from './MatterGameObject';

/**
 * A player shot: constant velocity, no forces, wraps like everything
 * else, expires after PROJECTILE.lifetimeMs. `isSensor: true` - it should
 * register a hit, not physically bounce off what it hits, so Matter still
 * owns collision *detection* (the testing-boundary decision in
 * docs/technical_design.md) without any physics *response* being needed.
 */
export class Projectile {
  readonly visual: MatterGameObject<Phaser.GameObjects.Arc>;
  readonly ownerIndex: number;
  private readonly spawnedAtMs: number;
  private alive = true;

  /** `hitsShips` is Competitive's friendly fire - Cooperative shots never target CATEGORY.SHIP at all, per docs/gameplay.md. */
  constructor(
    scene: Phaser.Scene,
    position: Vector2,
    headingRad: number,
    nowMs: number,
    color: number,
    ownerIndex: number,
    hitsShips: boolean,
  ) {
    this.spawnedAtMs = nowMs;
    this.ownerIndex = ownerIndex;

    const visual = scene.add.circle(position.x, position.y, PROJECTILE.radius, color);
    scene.matter.add.gameObject(visual, {
      shape: { type: 'circle', radius: PROJECTILE.radius },
      isSensor: true,
      frictionAir: 0,
      collisionFilter: {
        category: CATEGORY.PROJECTILE,
        mask: CATEGORY.ASTEROID | CATEGORY.UFO | (hitsShips ? CATEGORY.SHIP : 0),
      },
    });
    this.visual = visual as MatterGameObject<Phaser.GameObjects.Arc>;
    this.visual.setData('entity', this);
    this.visual.setVelocity(Math.cos(headingRad) * PROJECTILE.speed, Math.sin(headingRad) * PROJECTILE.speed);
  }

  get position(): Vector2 {
    return { x: this.visual.x, y: this.visual.y };
  }

  get isAlive(): boolean {
    return this.alive;
  }

  update(nowMs: number, arenaWidth: number, arenaHeight: number): void {
    if (nowMs - this.spawnedAtMs >= PROJECTILE.lifetimeMs) {
      this.destroy();
      return;
    }
    const wrapped = wrapPosition(this.position, PROJECTILE.radius, arenaWidth, arenaHeight);
    if (wrapped.x !== this.position.x || wrapped.y !== this.position.y) {
      this.visual.setPosition(wrapped.x, wrapped.y);
    }
  }

  destroy(): void {
    if (!this.alive) return;
    this.alive = false;
    this.visual.destroy();
  }
}
