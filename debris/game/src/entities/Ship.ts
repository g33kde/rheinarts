import Phaser from 'phaser';
import { SHIP, SHIP_HULL, SHIP_HULL_SCALE, COLORS } from '../config/GameConfig';
import { CATEGORY } from '../systems/CollisionCategories';
import { clampSpeed, wrapPosition } from '../systems/MovementSystem';
import type { Vector2 } from '../utilities/Vector2';
import type { MatterGameObject } from './MatterGameObject';

/**
 * A player ship: Matter-physics-driven (thrust is a real applied force,
 * "realistic drift" per docs/technical_design.md), but turning is direct/
 * kinematic - `setRotation()` straight from input, not torque - matching
 * docs/gameplay.md's "Turn... rotates the ship in place. Does not move it."
 *
 * Collision body is a plain circle (`SHIP.radius`) decoupled from the
 * visual hull, same pattern Godspeed used for its own entities - the
 * Interceptor silhouette (docs/art_direction.md) is drawn on top of a
 * simpler physics shape, not derived from it.
 */
export class Ship {
  readonly visual: MatterGameObject<Phaser.GameObjects.Graphics>;
  readonly color: number;
  private thrusting = false;
  private alive = true;
  private shielded = false;
  private invulnerableUntilMs = -Infinity;
  private lastNowMs = 0;

  /**
   * `shipCollisionEnabled` decides whether this ship's Matter body can
   * physically touch other ships at all - Cooperative excludes SHIP from
   * its own mask entirely ("player ships... pass through each other
   * harmlessly," docs/gameplay.md - not just non-lethal, no contact at
   * all), Competitive leaves it in (ramming is a real, mutually-lethal
   * threat in that mode - see GameScene's collision handling).
   */
  constructor(scene: Phaser.Scene, x: number, y: number, color: number, shipCollisionEnabled: boolean) {
    this.color = color;

    const visual = scene.add.graphics();
    scene.matter.add.gameObject(visual, {
      shape: { type: 'circle', radius: SHIP.radius },
      frictionAir: SHIP.frictionAir,
      friction: 0,
      frictionStatic: 0,
      restitution: 0.2,
      collisionFilter: {
        category: CATEGORY.SHIP,
        mask: shipCollisionEnabled ? 0xffff : 0xffff & ~CATEGORY.SHIP,
      },
    });
    this.visual = visual as MatterGameObject<Phaser.GameObjects.Graphics>;
    this.visual.setPosition(x, y);
    this.visual.setData('entity', this);
    // Turning is 100% kinematic - only setRotation() (from player input)
    // ever changes heading, per docs/gameplay.md. Without this, bumping an
    // asteroid off-center imparts a physics angular impulse that spins the
    // ship indefinitely (frictionAir: 0 above means nothing ever damps it
    // back out) - setFixedRotation() sets body inertia to Infinity so
    // collisions can never rotate the ship at all, matching the design.
    this.visual.setFixedRotation();
    // Hull's nose points along local +x (docs/art_direction.md), which
    // reads as "facing right" at the default angle 0 - every ship starts
    // facing north (-90°, screen coords: 0=right, +90°=down) instead, a
    // neutral default that doesn't favor either player's starting side
    // in Competitive.
    this.visual.setRotation(-Math.PI / 2);
    this.draw();
  }

  get position(): Vector2 {
    return { x: this.visual.x, y: this.visual.y };
  }

  /** For the UFO's lead-the-target aim - see systems/UfoTargeting.ts. */
  get velocity(): Vector2 {
    return this.visual.getVelocity();
  }

  get heading(): number {
    return this.visual.rotation;
  }

  get isAlive(): boolean {
    return this.alive;
  }

  setThrusting(thrusting: boolean): void {
    this.thrusting = thrusting;
  }

  get hasShield(): boolean {
    return this.shielded;
  }

  /** No-op if already shielded - single non-stacking charge, per docs/gameplay.md. */
  grantShield(): void {
    this.shielded = true;
  }

  /** Consumes the charge on an absorbed hit - "absorbs exactly one hit... then breaks." */
  consumeShield(): void {
    this.shielded = false;
  }

  /** Damage-only immunity - movement/turning still work, only handleCollision's damage paths check this. Firing is gated separately by GameScene (decided: can move during respawn invuln, can't shoot). */
  isInvulnerable(nowMs: number): boolean {
    return nowMs < this.invulnerableUntilMs;
  }

  grantInvulnerability(nowMs: number, durationMs: number): void {
    this.invulnerableUntilMs = nowMs + durationMs;
  }

  setRotation(angleRadians: number): void {
    this.visual.setRotation(angleRadians);
  }

  update(nowMs: number, _deltaSeconds: number, arenaWidth: number, arenaHeight: number): void {
    this.lastNowMs = nowMs;
    if (this.thrusting) {
      const angle = this.heading;
      this.visual.applyForce(
        new Phaser.Math.Vector2(Math.cos(angle) * SHIP.thrustForce, Math.sin(angle) * SHIP.thrustForce),
      );
    }

    const clamped = clampSpeed(this.visual.getVelocity(), SHIP.maxSpeed);
    this.visual.setVelocity(clamped.x, clamped.y);

    const wrapped = wrapPosition(this.position, SHIP.radius, arenaWidth, arenaHeight);
    if (wrapped.x !== this.position.x || wrapped.y !== this.position.y) {
      this.visual.setPosition(wrapped.x, wrapped.y);
    }

    this.draw();
  }

  private draw(): void {
    const g = this.visual;
    g.clear();

    // Flicker while invulnerable (respawn grace period) - blink every
    // 100ms, same read as classic Asteroids' post-respawn flash. Skipping
    // the draw entirely (rather than dimming alpha) keeps it a clean
    // on/off blink instead of a fade.
    if (this.isInvulnerable(this.lastNowMs) && Math.floor(this.lastNowMs / 100) % 2 === 0) {
      return;
    }

    if (this.thrusting) {
      const [rearX, rearY] = SHIP_HULL[4]!; // rear notch
      const flameLen = SHIP_HULL_SCALE * 0.9;
      const flameWidth = SHIP_HULL_SCALE * 0.35;
      g.fillStyle(COLORS.flame, 0.9);
      g.beginPath();
      g.moveTo(rearX * SHIP_HULL_SCALE, rearY * SHIP_HULL_SCALE - flameWidth);
      g.lineTo(rearX * SHIP_HULL_SCALE - flameLen, rearY * SHIP_HULL_SCALE);
      g.lineTo(rearX * SHIP_HULL_SCALE, rearY * SHIP_HULL_SCALE + flameWidth);
      g.closePath();
      g.fillPath();
    }

    g.fillStyle(COLORS.playerFill, 1);
    g.lineStyle(2, this.color, 1);
    g.beginPath();
    SHIP_HULL.forEach(([x, y], i) => {
      const px = x * SHIP_HULL_SCALE;
      const py = y * SHIP_HULL_SCALE;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    });
    g.closePath();
    g.fillPath();
    g.strokePath();

    if (this.shielded) {
      g.lineStyle(2, COLORS.shield, 0.8);
      g.strokeCircle(0, 0, SHIP_HULL_SCALE * 1.6);
    }
  }

  destroy(): void {
    if (!this.alive) return;
    this.alive = false;
    this.visual.destroy();
  }
}
