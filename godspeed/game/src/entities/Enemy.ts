import Phaser from 'phaser';
import type { Cell } from '../ai/Pathfinding';
import { COLORS, ENEMY, ENEMY_HEALTH_BAR } from '../config/GameConfig';
import { computeNextPosition } from '../systems/MovementSystem';
import { applyHit, isGameOver } from '../systems/HealthSystem';
import type { Vector2 } from '../utilities/Vector2';

/** Real sprite art instead of the default flat circle - see Boss.ts. */
export interface EnemyVisualArt {
  textureKey: string;
  frameKey: string;
  scale: number;
}

/**
 * Moves cell-to-cell in a straight line toward a target pixel position
 * (a maze cell center) handed to it each step by GameScene's chase logic.
 * Snaps to the target instead of overshooting, so it never needs to
 * backtrack or jitter around arrival.
 *
 * radius/color/speed/maxHits are constructor parameters (not always
 * ENEMY.*) so every subclass (Sentinel, Bulwark, Skirmisher, Boss, and
 * Drone/Seeker - see their own files) can reuse this movement + hit-point
 * behavior at different stats instead of duplicating it. hitsRemaining is
 * generic here rather than per-subclass, since all enemy types now take
 * more than one hit (see docs/enemy_design.md).
 *
 * `radius` always stays the collision hitbox regardless of visual - the
 * optional `visual` param (real sprite art, currently only Boss uses it)
 * controls display size separately via its own `scale`, same as how
 * PLAYER.radius and WARDEN_SPRITE.scale are already decoupled.
 *
 * Also draws a small health bar under the sprite - a separate pair of
 * GameObjects (not baked into the sprite itself, and depth-forced above
 * it) so it keeps working unchanged regardless of whether the entity is a
 * primitive circle or real sprite art, per docs/art_direction.md.
 */
export class Enemy {
  readonly sprite: Phaser.GameObjects.Arc | Phaser.GameObjects.Sprite;
  readonly radius: number;
  cell: Cell;
  hitsRemaining: number;
  protected readonly maxHits: number;
  protected alive = true;
  private readonly speed: number;
  private speedBoostMultiplier = 1;
  private targetPixel: Vector2;
  private readonly healthBarWidth: number;
  private readonly healthBarBg: Phaser.GameObjects.Rectangle;
  private readonly healthBarFill: Phaser.GameObjects.Rectangle;

  constructor(
    scene: Phaser.Scene,
    spawnCell: Cell,
    spawnPixel: Vector2,
    radius: number = ENEMY.radius,
    color: number = COLORS.danger,
    speed: number = ENEMY.speed,
    maxHits: number = 1,
    visual?: EnemyVisualArt,
  ) {
    if (visual) {
      const sprite = scene.add.sprite(spawnPixel.x, spawnPixel.y, visual.textureKey, visual.frameKey);
      sprite.setScale(visual.scale);
      this.sprite = sprite;
    } else {
      this.sprite = scene.add.circle(spawnPixel.x, spawnPixel.y, radius, color);
    }
    this.radius = radius;
    this.speed = speed;
    this.cell = spawnCell;
    this.targetPixel = spawnPixel;
    this.maxHits = maxHits;
    this.hitsRemaining = maxHits;

    this.healthBarWidth = radius * 2;
    const barY = spawnPixel.y + radius + ENEMY_HEALTH_BAR.offsetY;
    this.healthBarBg = scene.add
      .rectangle(
        spawnPixel.x,
        barY,
        this.healthBarWidth,
        ENEMY_HEALTH_BAR.height,
        COLORS.healthBarBackground,
        ENEMY_HEALTH_BAR.backgroundAlpha,
      )
      .setDepth(ENEMY_HEALTH_BAR.depth);
    this.healthBarFill = scene.add
      .rectangle(
        spawnPixel.x - this.healthBarWidth / 2,
        barY,
        this.healthBarWidth,
        ENEMY_HEALTH_BAR.height,
        COLORS.healthBarFill,
      )
      .setOrigin(0, 0.5)
      .setDepth(ENEMY_HEALTH_BAR.depth + 1);
  }

  get position(): Vector2 {
    return { x: this.sprite.x, y: this.sprite.y };
  }

  get isAlive(): boolean {
    return this.alive;
  }

  get hasArrived(): boolean {
    return this.position.x === this.targetPixel.x && this.position.y === this.targetPixel.y;
  }

  setTarget(cell: Cell, pixel: Vector2): void {
    this.cell = cell;
    this.targetPixel = pixel;
  }

  /** Temporary speed multiplier (1 = normal) - see Drone's lunge / Bulwark's charge. */
  setSpeedBoost(multiplier: number): void {
    this.speedBoostMultiplier = multiplier;
  }

  takeHit(): void {
    this.hitsRemaining = applyHit(this.hitsRemaining);
    const fraction = Math.max(0, this.hitsRemaining / this.maxHits);
    this.healthBarFill.setDisplaySize(this.healthBarWidth * fraction, ENEMY_HEALTH_BAR.height);
    if (isGameOver(this.hitsRemaining)) {
      this.destroy();
    }
  }

  update(deltaSeconds: number): void {
    const current = this.position;
    const dx = this.targetPixel.x - current.x;
    const dy = this.targetPixel.y - current.y;
    const distance = Math.hypot(dx, dy);
    const effectiveSpeed = this.speed * this.speedBoostMultiplier;
    const step = effectiveSpeed * deltaSeconds;

    if (distance !== 0) {
      if (distance <= step) {
        this.sprite.setPosition(this.targetPixel.x, this.targetPixel.y);
      } else {
        const next = computeNextPosition(current, { x: dx, y: dy }, effectiveSpeed, deltaSeconds);
        this.sprite.setPosition(next.x, next.y);
      }
    }

    const barY = this.sprite.y + this.radius + ENEMY_HEALTH_BAR.offsetY;
    this.healthBarBg.setPosition(this.sprite.x, barY);
    this.healthBarFill.setPosition(this.sprite.x - this.healthBarWidth / 2, barY);
  }

  destroy(): void {
    if (!this.alive) return;
    this.alive = false;
    this.destroyVisuals();
  }

  /** Actually removes the GameObjects. Split from destroy() so Boss can
   * mark itself dead immediately (for gameplay logic) while deferring this
   * until its death animation finishes playing - see Boss.ts. */
  protected destroyVisuals(): void {
    this.sprite.destroy();
    this.healthBarBg.destroy();
    this.healthBarFill.destroy();
  }
}
