import Phaser from 'phaser';
import { COLORS, PROJECTILE } from '../config/GameConfig';
import { isExpired } from '../systems/CombatSystem';
import type { Vector2 } from '../utilities/Vector2';

export class Projectile {
  readonly sprite: Phaser.GameObjects.Arc;
  private readonly velocity: Vector2;
  private readonly spawnedAtMs: number;
  private alive = true;

  constructor(
    scene: Phaser.Scene,
    position: Vector2,
    velocity: Vector2,
    nowMs: number,
    color: number = COLORS.projectile,
  ) {
    this.sprite = scene.add.circle(position.x, position.y, PROJECTILE.radius, color);
    this.velocity = velocity;
    this.spawnedAtMs = nowMs;
  }

  get isAlive(): boolean {
    return this.alive;
  }

  get position(): Vector2 {
    return { x: this.sprite.x, y: this.sprite.y };
  }

  update(deltaSeconds: number, nowMs: number): void {
    this.sprite.x += this.velocity.x * deltaSeconds;
    this.sprite.y += this.velocity.y * deltaSeconds;

    if (isExpired(this.spawnedAtMs, nowMs, PROJECTILE.lifetimeMs)) {
      this.destroy();
    }
  }

  destroy(): void {
    if (!this.alive) return;
    this.alive = false;
    this.sprite.destroy();
  }
}
