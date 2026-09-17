import Phaser from 'phaser';
import { COLORS, FRACTURE, PROJECTILE } from '../config/GameConfig';
import { generateAsteroidPoints } from '../systems/AsteroidShape';
import { CATEGORY } from '../systems/CollisionCategories';
import { wrapPosition } from '../systems/MovementSystem';
import type { Vector2 } from '../utilities/Vector2';
import type { MatterGameObject } from './MatterGameObject';

/**
 * The launcher Fragment's shot (docs/roadmap.md's Phase 2) - aimed once
 * at a random living ship at the moment it fires, then flies straight
 * (no homing), same "constant velocity, no forces" shape as `UfoShot`.
 * Kept as its own class rather than reusing `UfoShot` for the same
 * reason that one isn't shared with player `Projectile` - different
 * visual (a small jagged gold shard, not a plain circle) and different
 * ownership semantics.
 */
export class FractureShard {
  readonly visual: MatterGameObject<Phaser.GameObjects.Graphics>;
  private readonly points: Vector2[];
  private readonly spawnedAtMs: number;
  private readonly spinSpeed: number;
  private alive = true;

  constructor(scene: Phaser.Scene, position: Vector2, headingRad: number, nowMs: number, rng: () => number = Math.random) {
    this.spawnedAtMs = nowMs;
    this.points = generateAsteroidPoints(6, 0.4, rng);
    this.spinSpeed = (rng() - 0.5) * 1.2;

    const visual = scene.add.graphics();
    scene.matter.add.gameObject(visual, {
      shape: { type: 'circle', radius: FRACTURE.swarmRadius },
      isSensor: true,
      frictionAir: 0,
      // ASTEROID added on request - the shard destroys any asteroid it
      // hits too now, same as it already does a ship.
      collisionFilter: { category: CATEGORY.FRACTURE, mask: CATEGORY.SHIP | CATEGORY.ASTEROID },
    });
    this.visual = visual as MatterGameObject<Phaser.GameObjects.Graphics>;
    this.visual.setPosition(position.x, position.y);
    this.visual.setData('entity', this);
    this.visual.setVelocity(Math.cos(headingRad) * FRACTURE.shardSpeed, Math.sin(headingRad) * FRACTURE.shardSpeed);
    this.draw();
  }

  get position(): Vector2 {
    return { x: this.visual.x, y: this.visual.y };
  }

  get isAlive(): boolean {
    return this.alive;
  }

  update(nowMs: number, deltaSeconds: number, arenaWidth: number, arenaHeight: number): void {
    if (nowMs - this.spawnedAtMs >= PROJECTILE.lifetimeMs) {
      this.destroy();
      return;
    }
    this.visual.setRotation(this.visual.rotation + this.spinSpeed * deltaSeconds);
    const wrapped = wrapPosition(this.position, FRACTURE.swarmRadius, arenaWidth, arenaHeight);
    if (wrapped.x !== this.position.x || wrapped.y !== this.position.y) {
      this.visual.setPosition(wrapped.x, wrapped.y);
    }
  }

  private draw(): void {
    const g = this.visual;
    g.clear();
    g.fillStyle(COLORS.fractureFill, 1);
    g.lineStyle(1.3, COLORS.fractureLauncher, 1);
    g.beginPath();
    this.points.forEach((p, i) => {
      const px = p.x * FRACTURE.swarmRadius;
      const py = p.y * FRACTURE.swarmRadius;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    });
    g.closePath();
    g.fillPath();
    g.strokePath();
  }

  destroy(): void {
    if (!this.alive) return;
    this.alive = false;
    this.visual.destroy();
  }
}
