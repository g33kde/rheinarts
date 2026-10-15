import Phaser from 'phaser';
import { ASTEROID, COLORS } from '../config/GameConfig';
import {
  generateAsteroidPoints,
  generateCraters,
  pickCrackTargets,
  pickShapeFamily,
  seededRng,
  type AsteroidCrater,
} from '../systems/AsteroidShape';
import type { AsteroidSize } from '../systems/AsteroidSplit';
import { CATEGORY } from '../systems/CollisionCategories';
import { decayExcessSpeed, wrapPosition } from '../systems/MovementSystem';
import type { Vector2 } from '../utilities/Vector2';
import type { MatterGameObject } from './MatterGameObject';

// Per-rock surface detail (craters + crack lines, docs/roadmap.md's
// polish-pass item, scoped via a live-rendered concept review +
// AskUserQuestion) - cosmetic only, doesn't affect hit-testing, so kept
// file-local rather than in GameConfig.ts, same convention Cardinal.ts's
// own cosmetic constants use. Scaled down by size tier: small asteroids
// (16px across, numerous after splits) are too tiny for detail to read
// at all, so they get none - only medium/large get any, large gets more.
const CRATER_COUNT_BY_SIZE: Record<AsteroidSize, number> = { large: 3, medium: 2, small: 0 };
const CRACK_COUNT_BY_SIZE: Record<AsteroidSize, number> = { large: 2, medium: 1, small: 0 };

interface AsteroidLook {
  readonly points: Vector2[];
  readonly craters: AsteroidCrater[];
  readonly crackTargets: Vector2[];
}

/** Everything about a rock's looks, rolled from one integer seed - so the host can send just the seed and a client draws the identical rock. */
export function asteroidLookFor(size: AsteroidSize, seed: number): AsteroidLook {
  const rng = seededRng(seed);
  const family = pickShapeFamily(ASTEROID.shapeFamilies, rng);
  const vertexCount = Math.round(
    family.vertexCountRange[0] + rng() * (family.vertexCountRange[1] - family.vertexCountRange[0]),
  );
  const points = generateAsteroidPoints(vertexCount, family.jaggedness, rng);
  const craters = generateCraters(CRATER_COUNT_BY_SIZE[size], rng);
  const crackTargets = pickCrackTargets(points.length, CRACK_COUNT_BY_SIZE[size], rng).map((i) => points[i]!);
  return { points, craters, crackTargets };
}

/** Draws a rock (silhouette, cracks, craters) around the graphics' own origin. Shared by the real asteroid and a client's mirror of it. */
export function drawAsteroid(g: Phaser.GameObjects.Graphics, radius: number, look: AsteroidLook): void {
  g.clear();
  g.fillStyle(COLORS.asteroidFill, 1);
  g.lineStyle(2, COLORS.asteroid, 1);
  g.beginPath();
  look.points.forEach((p, i) => {
    const px = p.x * radius;
    const py = p.y * radius;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  });
  g.closePath();
  g.fillPath();
  g.strokePath();

  // Crack lines - from center out to one of the silhouette's own vertices (stopped a little short,
  // 0.85, so the crack reads as reaching the surface rather than poking past it).
  look.crackTargets.forEach((target) => {
    g.lineStyle(1, COLORS.asteroid, 0.35);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(target.x * radius * 0.85, target.y * radius * 0.85);
    g.strokePath();
  });

  look.craters.forEach((crater) => {
    g.lineStyle(1, COLORS.asteroid, 0.4);
    g.strokeCircle(crater.x * radius, crater.y * radius, crater.radius * radius);
  });
}

/**
 * A procedurally-shaped drifting rock - see docs/art_direction.md for why
 * this is generated, not art. Matter body is a plain circle (matching
 * Ship's decoupled hitbox/visual pattern); the jagged polygon is drawn on
 * top, scaled to the size tier's radius from docs/gameplay.md.
 *
 * "No rock-on-rock collision" is enforced via collision mask, not a
 * manual check - see systems/CollisionCategories.ts.
 *
 * Silhouette varies per rock (docs/roadmap.md's polish-pass item): one of
 * `ASTEROID.shapeFamilies` is picked at random (`pickShapeFamily`)
 * instead of every rock sharing one fixed vertexCountRange/jaggedness
 * pair. Larger rocks also get procedural surface detail - craters, and
 * crack lines reusing the silhouette's own vertices as endpoints so they
 * always land exactly on the jagged edge (see the two constants above).
 *
 * `baseSpeed` (its own tier's `speed`, `GameConfig.ts`) is stored rather
 * than just fed into the initial `setVelocity` and discarded - a real
 * bug fix, reported directly: a Gravity Well's pull has no speed ceiling
 * of its own, so a boosted rock stayed that fast permanently once
 * clear of the hazard. `update()`'s `isBeingPulled` param decays any
 * speed above `baseSpeed` back down, but only while not currently being
 * pulled - see `systems/MovementSystem.ts`'s `decayExcessSpeed` for the
 * full reasoning.
 */
export class Asteroid {
  readonly visual: MatterGameObject<Phaser.GameObjects.Graphics>;
  readonly size: AsteroidSize;
  readonly radius: number;
  private readonly spinSpeed: number;
  private readonly baseSpeed: number;
  /** Seeds the rock's looks; carried in network snapshots so clients draw the same rock. */
  readonly lookSeed: number;
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

    this.lookSeed = Math.floor(rng() * 4294967296);
    const look = asteroidLookFor(size, this.lookSeed);

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

    drawAsteroid(this.visual, this.radius, look);

    this.baseSpeed = stats.speed;
    this.visual.setVelocity(Math.cos(headingRad) * this.baseSpeed, Math.sin(headingRad) * this.baseSpeed);
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

  /**
   * `isBeingPulled` (docs from the reported Gravity Well bug fix, see
   * `systems/MovementSystem.ts`'s `decayExcessSpeed` doc comment) - true
   * whenever a Black Hole or Fracture gravity Fragment applied a pull
   * force to this rock earlier in the same frame
   * (`GameScene.applyBlackHoleGravityForces`/`applyFractureGravityForces`).
   * Only while `false` does any speed above this rock's own `baseSpeed`
   * bleed back off - a rock currently mid-pull keeps whatever dramatic
   * acceleration the hazard is actively giving it.
   */
  update(deltaSeconds: number, arenaWidth: number, arenaHeight: number, isBeingPulled: boolean): void {
    this.visual.setRotation(this.visual.rotation + this.spinSpeed * deltaSeconds);

    if (!isBeingPulled) {
      const velocity = this.visual.getVelocity();
      const decayed = decayExcessSpeed(velocity, this.baseSpeed, ASTEROID.speedDecayPerSec, deltaSeconds);
      if (decayed.x !== velocity.x || decayed.y !== velocity.y) {
        this.visual.setVelocity(decayed.x, decayed.y);
      }
    }

    const wrapped = wrapPosition(this.position, this.radius, arenaWidth, arenaHeight);
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
