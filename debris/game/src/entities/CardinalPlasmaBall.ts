import Phaser from 'phaser';
import { CARDINAL, COLORS } from '../config/GameConfig';
import { CATEGORY } from '../systems/CollisionCategories';
import { wrapPosition } from '../systems/MovementSystem';
import type { Vector2 } from '../utilities/Vector2';
import type { MatterGameObject } from './MatterGameObject';

/**
 * Phase 2's attack (docs/roadmap.md) - "every 2 seconds, fires a plasma
 * ball at the nearest player." Aimed once at spawn (GameScene computes
 * the lead-aim heading via `systems/UfoTargeting.ts`, same math the
 * UFO's own shot already uses) then flies straight, no homing - same
 * "constant velocity, no forces" shape as `FractureShard`/`UfoShot`.
 * Kept as its own class rather than reusing either of those for the same
 * reason FractureShard isn't shared with UfoShot: different visual,
 * different ownership semantics, and its own `CATEGORY.CARDINAL` mask so
 * the two bosses' collision filters stay independent.
 */
export class CardinalPlasmaBall {
  readonly visual: MatterGameObject<Phaser.GameObjects.Graphics>;
  private readonly spawnedAtMs: number;
  private alive = true;

  constructor(scene: Phaser.Scene, position: Vector2, headingRad: number, nowMs: number) {
    this.spawnedAtMs = nowMs;

    const visual = scene.add.graphics();
    scene.matter.add.gameObject(visual, {
      shape: { type: 'circle', radius: CARDINAL.plasmaRadius },
      isSensor: true,
      frictionAir: 0,
      friction: 0,
      frictionStatic: 0,
      collisionFilter: { category: CATEGORY.CARDINAL, mask: CATEGORY.SHIP },
    });
    this.visual = visual as MatterGameObject<Phaser.GameObjects.Graphics>;
    this.visual.setPosition(position.x, position.y);
    this.visual.setData('entity', this);
    this.visual.setVelocity(Math.cos(headingRad) * CARDINAL.plasmaSpeed, Math.sin(headingRad) * CARDINAL.plasmaSpeed);
    this.draw();
  }

  get position(): Vector2 {
    return { x: this.visual.x, y: this.visual.y };
  }

  get isAlive(): boolean {
    return this.alive;
  }

  update(nowMs: number, arenaWidth: number, arenaHeight: number): void {
    if (!this.alive) return;
    if (nowMs - this.spawnedAtMs >= CARDINAL.plasmaLifetimeMs) {
      this.destroy();
      return;
    }
    const wrapped = wrapPosition(this.position, CARDINAL.plasmaRadius, arenaWidth, arenaHeight);
    if (wrapped.x !== this.position.x || wrapped.y !== this.position.y) {
      this.visual.setPosition(wrapped.x, wrapped.y);
    }
  }

  private draw(): void {
    const g = this.visual;
    g.clear();
    g.fillStyle(COLORS.fractureLauncher, 0.18);
    g.fillCircle(0, 0, CARDINAL.plasmaRadius * 1.8);
    g.fillStyle(COLORS.fractureLauncher, 1);
    g.fillCircle(0, 0, CARDINAL.plasmaRadius);
  }

  destroy(): void {
    if (!this.alive) return;
    this.alive = false;
    this.visual.destroy();
  }
}
