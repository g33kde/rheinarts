import Phaser from 'phaser';
import { COLORS, FRACTURE } from '../config/GameConfig';
import { applyHit } from '../systems/FractureCombat';
import { generateAsteroidPoints } from '../systems/AsteroidShape';
import { CATEGORY } from '../systems/CollisionCategories';
import type { Vector2 } from '../utilities/Vector2';
import type { MatterGameObject } from './MatterGameObject';

const SHARD_COUNT = 6;
const SHARD_BASE_DIST = 46;
const SHARD_DIST_VARIANCE = 16;
const SHARD_MIN_RADIUS = 15;
const SHARD_RADIUS_VARIANCE = 7;

interface Shard {
  readonly angle: number;
  readonly dist: number;
  readonly bobPhase: number;
  readonly rotSpeed: number;
  readonly points: Vector2[];
  readonly radius: number;
}

/**
 * "Shard Cluster," chosen via a live concept review: six jagged crystal
 * shards loosely tethered to one pulsing core. See `GameConfig.ts`'s
 * `FRACTURE` doc comment for the full three-tier design. This entity
 * owns its own drift-to-center movement and laser-firing readiness;
 * GameScene owns the trigger, announcement, materialize sequencing, and
 * actually spawning/aiming each laser (`FractureLaser`).
 *
 * Solid (non-sensor) Matter body, same pattern as `Ufo`/`Asteroid`.
 * Collision mask includes `CATEGORY.SHIP` now ("behave like rocks,"
 * decided - GameScene resolves ship contact the same way an asteroid
 * ram already does) alongside `CATEGORY.PROJECTILE`; asteroids still
 * pass through untouched, same simplification as before.
 */
export class Fracture {
  readonly visual: MatterGameObject<Phaser.GameObjects.Graphics>;
  private readonly shards: Shard[];
  private readonly spawnedAtMs: number;
  private hitsRemaining: number = FRACTURE.maxHits;
  private alive = true;
  private stopped = false;
  private lastLaserAtMs = -Infinity;

  constructor(scene: Phaser.Scene, position: Vector2, nowMs: number, rng: () => number = Math.random) {
    this.spawnedAtMs = nowMs;
    this.shards = Array.from({ length: SHARD_COUNT }, (_, i) => ({
      angle: (i / SHARD_COUNT) * Math.PI * 2 + 0.3,
      dist: SHARD_BASE_DIST + (i % 2) * SHARD_DIST_VARIANCE,
      bobPhase: rng() * Math.PI * 2,
      rotSpeed: (rng() - 0.5) * 0.0004,
      points: generateAsteroidPoints(6, 0.4, rng),
      radius: SHARD_MIN_RADIUS + rng() * SHARD_RADIUS_VARIANCE,
    }));

    const visual = scene.add.graphics();
    scene.matter.add.gameObject(visual, {
      shape: { type: 'circle', radius: FRACTURE.radius },
      frictionAir: 0,
      friction: 0,
      frictionStatic: 0,
      collisionFilter: {
        category: CATEGORY.FRACTURE,
        // ASTEROID added on request - an asteroid that drifts into the
        // Core is destroyed on contact too now, same "behave like rocks"
        // rule ships already got (see GameScene.handleCollision).
        mask: CATEGORY.PROJECTILE | CATEGORY.SHIP | CATEGORY.ASTEROID,
      },
    });
    this.visual = visual as MatterGameObject<Phaser.GameObjects.Graphics>;
    this.visual.setPosition(position.x, position.y);
    this.visual.setData('entity', this);
    // "Appears outside of screen and slowly drifts... towards the middle
    // of the screen, then stops there," decided - spawned off-screen by
    // GameScene, this is the drift itself. Stops once update() sees it's
    // reached arena-center (see below), not on a timer.
    this.visual.setVelocity(0, FRACTURE.driftSpeedPxPerStep);
    this.draw(nowMs);
  }

  get position(): Vector2 {
    return { x: this.visual.x, y: this.visual.y };
  }

  get isAlive(): boolean {
    return this.alive;
  }

  /** Not hittable while still coalescing - a beat of fairness before the fight actually starts, same spirit as SHIP.respawnInvulnerabilityMs. */
  isMaterializing(nowMs: number): boolean {
    return nowMs - this.spawnedAtMs < FRACTURE.materializeDurationMs;
  }

  /** No-op (returns `destroyed: false`) while still materializing - the caller still gets a definite answer either way. `damage` defaults to 1 (a normal shot) - Heavy Shot passes more, see FractureCombat.applyHit's own doc comment. */
  takeHit(nowMs: number, damage = 1): boolean {
    if (this.isMaterializing(nowMs)) return false;
    const result = applyHit(this.hitsRemaining, damage);
    this.hitsRemaining = result.hitsRemaining;
    return result.destroyed;
  }

  update(nowMs: number, arenaHeight: number): void {
    if (!this.alive) return;

    if (!this.stopped && this.position.y >= arenaHeight / 2) {
      this.visual.setVelocity(0, 0);
      this.stopped = true;
      this.lastLaserAtMs = nowMs; // first laser is laserCooldownMs after arrival, not instant
    }

    this.draw(nowMs);
  }

  /** False until it's actually stopped at arena-center - no lasers mid-drift. */
  canFireLaser(nowMs: number): boolean {
    return this.stopped && !this.isMaterializing(nowMs) && nowMs - this.lastLaserAtMs >= FRACTURE.laserCooldownMs;
  }

  recordLaserFired(nowMs: number): void {
    this.lastLaserAtMs = nowMs;
  }

  private draw(nowMs: number): void {
    const g = this.visual;
    g.clear();

    const materializeT = Math.min(1, (nowMs - this.spawnedAtMs) / FRACTURE.materializeDurationMs);
    const eased = 1 - (1 - materializeT) ** 3; // ease-out cubic, same curve ScorePopup already uses
    g.setAlpha(eased);
    g.setScale(0.3 + 0.7 * eased);

    const pulse = 0.55 + 0.45 * Math.sin(nowMs / 500);

    this.shards.forEach((s) => {
      const bob = Math.sin(nowMs / 1400 + s.bobPhase) * 4;
      const x = Math.cos(s.angle) * (s.dist + bob);
      const y = Math.sin(s.angle) * (s.dist + bob);

      g.lineStyle(1, COLORS.ufo, 0.2 + 0.3 * pulse);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(x, y);
      g.strokePath();

      g.save();
      g.translateCanvas(x, y);
      g.rotateCanvas(nowMs * s.rotSpeed);
      g.fillStyle(COLORS.fractureFill, 1);
      g.lineStyle(1.6, COLORS.fracture, 1);
      g.beginPath();
      s.points.forEach((p, i) => {
        const px = p.x * s.radius;
        const py = p.y * s.radius;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      });
      g.closePath();
      g.fillPath();
      g.strokePath();
      g.restore();
    });

    // core - layered soft glow (Graphics has no true blur, same "layered
    // flat fills" stand-in BlackHole.ts already uses) plus a solid center.
    g.fillStyle(COLORS.ufo, 0.12 * pulse);
    g.fillCircle(0, 0, 18 + 6 * pulse);
    g.fillStyle(COLORS.ufo, 0.6 + 0.4 * pulse);
    g.fillCircle(0, 0, 8 + 2 * pulse);
  }

  destroy(): void {
    if (!this.alive) return;
    this.alive = false;
    this.visual.destroy();
  }
}
