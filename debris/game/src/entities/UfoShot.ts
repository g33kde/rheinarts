import Phaser from 'phaser';
import { COLORS, UFO } from '../config/GameConfig';
import { CATEGORY } from '../systems/CollisionCategories';
import { wrapPosition } from '../systems/MovementSystem';
import type { Vector2 } from '../utilities/Vector2';
import type { MatterGameObject } from './MatterGameObject';

/**
 * A UFO's shot: same constant-velocity/sensor/wrap/expire shape as a
 * player `Projectile`, kept as its own class rather than generalizing
 * Projectile - the two have different collision targets (this only ever
 * hits a ship, never an asteroid) and different ownership semantics
 * (no `ownerIndex` - there's only ever one UFO team), so sharing one
 * class would mean threading UFO-only concerns through player-shot logic
 * and vice versa.
 */
export class UfoShot {
  readonly visual: MatterGameObject<Phaser.GameObjects.Arc>;
  private readonly spawnedAtMs: number;
  private alive = true;

  constructor(scene: Phaser.Scene, position: Vector2, headingRad: number, nowMs: number) {
    this.spawnedAtMs = nowMs;

    const visual = scene.add.circle(position.x, position.y, UFO.shotRadius, COLORS.ufo);
    scene.matter.add.gameObject(visual, {
      shape: { type: 'circle', radius: UFO.shotRadius },
      isSensor: true,
      frictionAir: 0,
      collisionFilter: { category: CATEGORY.UFO_SHOT, mask: CATEGORY.SHIP },
    });
    this.visual = visual as MatterGameObject<Phaser.GameObjects.Arc>;
    this.visual.setData('entity', this);
    this.visual.setVelocity(Math.cos(headingRad) * UFO.shotSpeed, Math.sin(headingRad) * UFO.shotSpeed);
  }

  get position(): Vector2 {
    return { x: this.visual.x, y: this.visual.y };
  }

  get isAlive(): boolean {
    return this.alive;
  }

  update(nowMs: number, arenaWidth: number, arenaHeight: number): void {
    if (nowMs - this.spawnedAtMs >= UFO.shotLifetimeMs) {
      this.destroy();
      return;
    }
    const wrapped = wrapPosition(this.position, UFO.shotRadius, arenaWidth, arenaHeight);
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
