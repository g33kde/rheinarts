import Phaser from 'phaser';
import { COLORS, FRACTURE } from '../config/GameConfig';
import { generateAsteroidPoints } from '../systems/AsteroidShape';
import { CATEGORY } from '../systems/CollisionCategories';
import { applyHit } from '../systems/FractureCombat';
import { ringLethalRadiusAt, ringPhaseAt } from '../systems/FractureRing';
import { wrapPosition } from '../systems/MovementSystem';
import type { Vector2 } from '../utilities/Vector2';
import type { MatterGameObject } from './MatterGameObject';

export type FractureFragmentRole = 'aggressive' | 'gravity' | 'launcher';

const SHARD_COUNT = 3;
const SHARD_BASE_DIST = 24;
const SHARD_DIST_VARIANCE = 10;
const SHARD_MIN_RADIUS = 9;
const SHARD_RADIUS_VARIANCE = 5;
const GRAVITY_PARTICLE_COUNT = 4;

interface Shard {
  readonly angle: number;
  readonly dist: number;
  readonly bobPhase: number;
  readonly points: Vector2[];
  readonly radius: number;
}

interface GravityParticle {
  angle: number;
  frac: number; // 1 = outer edge, 0 = about to respawn
}

/**
 * Phase 2 of The Fracture (docs/roadmap.md) - one of three independent
 * pieces spawned on the Core's death, smaller version of the same
 * "Shard Cluster" look. Moves - plain constant-velocity drift, same
 * "pure momentum, no steering" philosophy `docs/gameplay.md` already
 * uses for asteroids, not player-seeking.
 *
 * `role` now drives a real attack, not just a color/flourish:
 * - **aggressive** - a pulsing ring, self-timed (`currentRingHitRadius`,
 *   GameScene hit-tests ships against it each frame - the pure radius
 *   math lives in `systems/FractureRing.ts`, tested).
 * - **gravity** - no state of its own; GameScene applies
 *   `systems/BlackHoleGravity.ts`'s pull force directly against this
 *   fragment's position/radius every frame it's alive.
 * - **launcher** - fires via `canFireShard`/`recordShardFired`, same
 *   readiness-check shape `Ufo.canFire`/`recordFired` already uses;
 *   GameScene owns aiming and actually creating the `FractureShard`.
 *
 * Ship contact ("behave like rocks," decided) is a plain Matter
 * collision - `CATEGORY.SHIP` is in this fragment's mask now, resolved
 * by GameScene the same way an asteroid ram already is.
 */
export class FractureFragment {
  readonly visual: MatterGameObject<Phaser.GameObjects.Graphics>;
  readonly role: FractureFragmentRole;
  private readonly shards: Shard[];
  private readonly gravityParticles: GravityParticle[];
  private readonly spawnedAtMs: number;
  private hitsRemaining: number = FRACTURE.fragmentMaxHits;
  private ringStartedAtMs: number;
  private lastShardFiredAtMs: number;
  private alive = true;

  constructor(
    scene: Phaser.Scene,
    position: Vector2,
    role: FractureFragmentRole,
    headingRad: number,
    nowMs: number,
    rng: () => number = Math.random,
  ) {
    this.role = role;
    this.spawnedAtMs = nowMs;
    this.ringStartedAtMs = nowMs;
    this.lastShardFiredAtMs = nowMs;
    this.shards = Array.from({ length: SHARD_COUNT }, (_, i) => ({
      angle: (i / SHARD_COUNT) * Math.PI * 2 + rng(),
      dist: SHARD_BASE_DIST + rng() * SHARD_DIST_VARIANCE,
      bobPhase: rng() * Math.PI * 2,
      points: generateAsteroidPoints(6, 0.4, rng),
      radius: SHARD_MIN_RADIUS + rng() * SHARD_RADIUS_VARIANCE,
    }));
    this.gravityParticles = Array.from({ length: GRAVITY_PARTICLE_COUNT }, (_, i) => ({
      angle: (i / GRAVITY_PARTICLE_COUNT) * Math.PI * 2,
      frac: rng(),
    }));

    const visual = scene.add.graphics();
    scene.matter.add.gameObject(visual, {
      shape: { type: 'circle', radius: FRACTURE.fragmentRadius },
      frictionAir: 0,
      friction: 0,
      frictionStatic: 0,
      collisionFilter: {
        category: CATEGORY.FRACTURE,
        mask: CATEGORY.PROJECTILE | CATEGORY.SHIP,
      },
    });
    this.visual = visual as MatterGameObject<Phaser.GameObjects.Graphics>;
    this.visual.setPosition(position.x, position.y);
    this.visual.setData('entity', this);
    this.visual.setVelocity(
      Math.cos(headingRad) * FRACTURE.fragmentSpeed,
      Math.sin(headingRad) * FRACTURE.fragmentSpeed,
    );
    this.draw(nowMs);
  }

  get position(): Vector2 {
    return { x: this.visual.x, y: this.visual.y };
  }

  get isAlive(): boolean {
    return this.alive;
  }

  isMaterializing(nowMs: number): boolean {
    return nowMs - this.spawnedAtMs < FRACTURE.materializeDurationMs;
  }

  takeHit(nowMs: number): boolean {
    if (this.isMaterializing(nowMs)) return false;
    const result = applyHit(this.hitsRemaining);
    this.hitsRemaining = result.hitsRemaining;
    return result.destroyed;
  }

  /** Aggressive only - `undefined` outside the ring's brief expanding window. GameScene hit-tests ships against this each frame. */
  currentRingHitRadius(nowMs: number): number | undefined {
    if (this.role !== 'aggressive' || this.isMaterializing(nowMs)) return undefined;
    const elapsed = nowMs - this.ringStartedAtMs;
    return ringLethalRadiusAt(elapsed, FRACTURE.ringTelegraphMs, FRACTURE.ringExpandMs, this.ringMaxRadius());
  }

  /** Launcher only - mirrors `Ufo.canFire`'s exact shape. */
  canFireShard(nowMs: number): boolean {
    return (
      this.role === 'launcher' &&
      !this.isMaterializing(nowMs) &&
      nowMs - this.lastShardFiredAtMs >= FRACTURE.shardCooldownMs
    );
  }

  recordShardFired(nowMs: number): void {
    this.lastShardFiredAtMs = nowMs;
  }

  private ringMaxRadius(): number {
    return FRACTURE.fragmentRadius * FRACTURE.ringMaxRadiusMultiplier;
  }

  update(nowMs: number, deltaSeconds: number, arenaWidth: number, arenaHeight: number): void {
    if (!this.alive) return;

    const wrapped = wrapPosition(this.position, FRACTURE.fragmentRadius, arenaWidth, arenaHeight);
    if (wrapped.x !== this.position.x || wrapped.y !== this.position.y) {
      this.visual.setPosition(wrapped.x, wrapped.y);
    }

    if (this.role === 'gravity') {
      this.gravityParticles.forEach((p) => {
        p.frac -= deltaSeconds * 0.5;
        if (p.frac <= 0) {
          p.frac = 1;
          p.angle = Math.random() * Math.PI * 2;
        }
      });
    }

    if (this.role === 'aggressive') {
      const elapsed = nowMs - this.ringStartedAtMs;
      if (ringPhaseAt(elapsed, FRACTURE.ringTelegraphMs, FRACTURE.ringExpandMs, FRACTURE.ringFadeMs) === 'done') {
        this.ringStartedAtMs = nowMs; // "every 5 seconds," measured start-to-start
      }
    }

    this.draw(nowMs);
  }

  private roleColor(): number {
    if (this.role === 'aggressive') return COLORS.ufo;
    if (this.role === 'gravity') return COLORS.blackHole;
    return COLORS.fractureLauncher;
  }

  private draw(nowMs: number): void {
    const g = this.visual;
    g.clear();

    const materializeT = Math.min(1, (nowMs - this.spawnedAtMs) / FRACTURE.materializeDurationMs);
    const eased = 1 - (1 - materializeT) ** 3;
    g.setAlpha(eased);
    g.setScale(0.3 + 0.7 * eased);

    const pulse = 0.55 + 0.45 * Math.sin(nowMs / 500);
    const color = this.roleColor();

    this.shards.forEach((s) => {
      const jitter = this.role === 'aggressive' ? Math.sin(nowMs / 90 + s.bobPhase * 10) * 0.3 : 0;
      const bob = Math.sin(nowMs / 1200 + s.bobPhase) * 3;
      const x = Math.cos(s.angle + jitter) * (s.dist + bob);
      const y = Math.sin(s.angle + jitter) * (s.dist + bob);

      g.lineStyle(1, color, 0.25 + 0.35 * pulse);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(x, y);
      g.strokePath();

      g.save();
      g.translateCanvas(x, y);
      g.fillStyle(COLORS.fractureFill, 1);
      g.lineStyle(1.4, COLORS.fracture, 1);
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

    if (this.role === 'gravity') {
      this.gravityParticles.forEach((p) => {
        const r = 22 * p.frac;
        const px = Math.cos(p.angle) * r;
        const py = Math.sin(p.angle) * r;
        g.fillStyle(COLORS.blackHole, 0.3 + 0.6 * p.frac);
        g.fillCircle(px, py, 1.6);
      });
      // faint outer ring marking the actual pull radius - "acts like a small black hole," decided
      g.lineStyle(1, COLORS.blackHole, 0.15);
      g.strokeCircle(0, 0, FRACTURE.fragmentRadius * FRACTURE.gravityPullRadiusMultiplier);
    }

    if (this.role === 'aggressive') {
      const elapsed = nowMs - this.ringStartedAtMs;
      const phase = ringPhaseAt(elapsed, FRACTURE.ringTelegraphMs, FRACTURE.ringExpandMs, FRACTURE.ringFadeMs);
      if (phase === 'telegraph') {
        g.lineStyle(1.5, COLORS.ufo, 0.2 + 0.4 * (elapsed / FRACTURE.ringTelegraphMs));
        g.strokeCircle(0, 0, this.ringMaxRadius());
      } else if (phase === 'expanding') {
        const r = ringLethalRadiusAt(elapsed, FRACTURE.ringTelegraphMs, FRACTURE.ringExpandMs, this.ringMaxRadius());
        g.lineStyle(3, COLORS.ufo, 0.85);
        g.strokeCircle(0, 0, r ?? 0);
      } else if (phase === 'fading') {
        const fadeT = (elapsed - FRACTURE.ringTelegraphMs - FRACTURE.ringExpandMs) / FRACTURE.ringFadeMs;
        g.lineStyle(3, COLORS.ufo, 0.85 * (1 - fadeT));
        g.strokeCircle(0, 0, this.ringMaxRadius());
      }
    }

    // core - layered soft glow (same "layered flat fills" stand-in BlackHole.ts/Fracture.ts already use) plus a solid center, tinted by role.
    g.fillStyle(color, 0.12 * pulse);
    g.fillCircle(0, 0, 14 + 5 * pulse);
    g.fillStyle(color, 0.6 + 0.4 * pulse);
    g.fillCircle(0, 0, 6 + 1.5 * pulse);
  }

  destroy(): void {
    if (!this.alive) return;
    this.alive = false;
    this.visual.destroy();
  }
}
