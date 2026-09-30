import Phaser from 'phaser';
import { COLORS } from '../config/GameConfig';
import { generateAsteroidPoints } from '../systems/AsteroidShape';
import { CATEGORY } from '../systems/CollisionCategories';
import type { Vector2 } from '../utilities/Vector2';
import type { MatterGameObject } from './MatterGameObject';

/**
 * One piece of static arena wreckage (docs/roadmap.md's "arena
 * terrain") - the first thing in this game that physically blocks
 * anything. Cover to break line of sight behind, and a fixed obstacle
 * in an arena that previously had no geography at all.
 *
 * **A static Matter body**, so everything physical bounces off it for
 * free rather than needing a hand-rolled check per entity type - ships,
 * asteroids, the UFO and shots all already collide with the world.
 * That does mean rocks ricochet off it, which is new (the field has
 * always been "no rock-on-rock collision, nothing to hit"): it reads
 * correctly for a debris field, and `ArenaTerrain.generateTerrain`'s
 * separation rule is what keeps pieces from forming a pocket something
 * could get wedged in.
 *
 * Silhouette reuses `AsteroidShape`'s own procedural generator rather
 * than a new one - this *is* a big dead rock, and it should look like
 * it belongs to the same field as everything else.
 */
export class Wreck {
  readonly visual: MatterGameObject<Phaser.GameObjects.Graphics>;
  readonly radius: number;
  private alive = true;

  constructor(scene: Phaser.Scene, position: Vector2, radius: number, shapeSeed: number) {
    this.radius = radius;

    // A seeded rng so a placement's silhouette is reproducible from its
    // own seed rather than re-rolled on every construction.
    let seed = Math.floor(shapeSeed * 100000) + 1;
    const rng = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    // Unit-scale points - scaled by radius when drawn, same as Asteroid does.
    const points = generateAsteroidPoints(11, 0.35, rng);

    const visual = scene.add.graphics();
    scene.matter.add.gameObject(visual, {
      shape: { type: 'circle', radius },
      isStatic: true, // never moves, never wraps - see ArenaTerrain's note on why that's safe
      collisionFilter: {
        category: CATEGORY.WRECK,
        // Blocks everything physical. Deliberately not the Commander:
        // an adrift pilot getting pinned behind wreckage during a
        // 10-second rescue window would be miserable, and the rescue
        // hook matters more here than the consistency.
        mask: CATEGORY.SHIP | CATEGORY.ASTEROID | CATEGORY.PROJECTILE | CATEGORY.UFO | CATEGORY.UFO_SHOT,
      },
    });
    this.visual = visual as MatterGameObject<Phaser.GameObjects.Graphics>;
    this.visual.setPosition(position.x, position.y);
    this.visual.setData('entity', this);

    // Drawn once - a static body's look never changes, so unlike every
    // other entity here this doesn't redraw per frame.
    const g = visual;
    g.fillStyle(COLORS.asteroidFill, 1);
    g.lineStyle(2, COLORS.asteroid, 0.55);
    g.beginPath();
    points.forEach((point, i) => {
      if (i === 0) g.moveTo(point.x * radius, point.y * radius);
      else g.lineTo(point.x * radius, point.y * radius);
    });
    g.closePath();
    g.fillPath();
    g.strokePath();

    // A few interior scars so a big piece doesn't read as a flat blob.
    g.lineStyle(1, COLORS.asteroid, 0.28);
    for (let i = 0; i < 3; i += 1) {
      const a = rng() * Math.PI * 2;
      const len = radius * (0.3 + rng() * 0.4);
      g.beginPath();
      g.moveTo(Math.cos(a) * radius * 0.15, Math.sin(a) * radius * 0.15);
      g.lineTo(Math.cos(a) * len, Math.sin(a) * len);
      g.strokePath();
    }
  }

  get position(): Vector2 {
    return { x: this.visual.x, y: this.visual.y };
  }

  get isAlive(): boolean {
    return this.alive;
  }

  destroy(): void {
    if (!this.alive) return;
    this.alive = false;
    this.visual.destroy();
  }
}
