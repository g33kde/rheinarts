import Phaser from 'phaser';
import { ASTEROID, COLORS } from '../config/GameConfig';
import { generateAsteroidPoints } from '../systems/AsteroidShape';
import type { AsteroidSize } from '../systems/AsteroidSplit';
import { CATEGORY } from '../systems/CollisionCategories';
import { wrapPosition } from '../systems/MovementSystem';
import type { Vector2 } from '../utilities/Vector2';
import type { MatterGameObject } from './MatterGameObject';

/**
 * A procedurally-shaped drifting rock - see docs/art_direction.md for why
 * this is generated, not art. Matter body is a plain circle (matching
 * Ship's decoupled hitbox/visual pattern); the jagged polygon is drawn on
 * top, scaled to the size tier's radius from docs/gameplay.md.
 *
 * "No rock-on-rock collision" is enforced via collision mask, not a
 * manual check - see systems/CollisionCategories.ts.
 */
export class Asteroid {
  readonly visual: MatterGameObject<Phaser.GameObjects.Graphics>;
  readonly size: AsteroidSize;
  readonly radius: number;
  private readonly spinSpeed: number;
  private alive = true;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    size: AsteroidSize,
    headingRad: number,
    rng: () => number = Math.random,
  ) {
    this.size = size;
    const stats = ASTEROID[size];
    this.radius = stats.radius;
    this.spinSpeed = (rng() - 0.5) * 0.6; // slow constant rotation, per docs/gameplay.md

    const vertexCount = Math.round(
      ASTEROID.vertexCountRange[0] + rng() * (ASTEROID.vertexCountRange[1] - ASTEROID.vertexCountRange[0]),
    );
    const points = generateAsteroidPoints(vertexCount, ASTEROID.jaggedness, rng);

    const visual = scene.add.graphics();
    scene.matter.add.gameObject(visual, {
      shape: { type: 'circle', radius: this.radius },
      frictionAir: 0,
      friction: 0,
      frictionStatic: 0,
      restitution: 0.4,
      collisionFilter: {
        category: CATEGORY.ASTEROID,
        // collides with everything except other asteroids
        mask: 0xffff & ~CATEGORY.ASTEROID,
      },
    });
    this.visual = visual as MatterGameObject<Phaser.GameObjects.Graphics>;
    this.visual.setPosition(x, y);
    this.visual.setData('entity', this);

    this.draw(points);

    const speed = stats.speed;
    this.visual.setVelocity(Math.cos(headingRad) * speed, Math.sin(headingRad) * speed);
  }

  get position(): Vector2 {
    return { x: this.visual.x, y: this.visual.y };
  }

  get isAlive(): boolean {
    return this.alive;
  }

  /** Direction of travel (from current velocity), not the cosmetic spin
   * rotation - used when a split needs "the parent's original heading." */
  get headingRad(): number {
    const velocity = this.visual.getVelocity();
    return Math.atan2(velocity.y, velocity.x);
  }

  update(deltaSeconds: number, arenaWidth: number, arenaHeight: number): void {
    this.visual.setRotation(this.visual.rotation + this.spinSpeed * deltaSeconds);

    const wrapped = wrapPosition(this.position, this.radius, arenaWidth, arenaHeight);
    if (wrapped.x !== this.position.x || wrapped.y !== this.position.y) {
      this.visual.setPosition(wrapped.x, wrapped.y);
    }
  }

  private draw(points: Vector2[]): void {
    const g = this.visual;
    g.clear();
    g.fillStyle(COLORS.asteroidFill, 1);
    g.lineStyle(2, COLORS.asteroid, 1);
    g.beginPath();
    points.forEach((p, i) => {
      const px = p.x * this.radius;
      const py = p.y * this.radius;
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
