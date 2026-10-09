import Phaser from 'phaser';
import { SABOTEUR } from '../config/GameConfig';
import { CATEGORY } from '../systems/CollisionCategories';
import { wrapPosition } from '../systems/MovementSystem';
import { turnToward } from '../systems/SaboteurAI';
import type { Vector2 } from '../utilities/Vector2';
import type { MatterGameObject } from './MatterGameObject';

const METAL = 0x3c4560;
const METAL_FILL = 0x14141c;
const DANGER = 0xe0463c;
const NODE_COUNT = 5;
const RING_ROTATE_PERIOD_MS = 7000;

/**
 * "The Layer," picked over two other mine-deployment mockups (rack-
 * belly, towline) - a carousel of mine-nodes ringing the hull, so the
 * number still attached is a direct read of how many it has left to
 * drop. Solid body, same mask shape as `Ufo.ts` - ships/asteroids nudge
 * it on contact before game logic destroys it, not pass through
 * silently.
 *
 * No weapon of its own at all (docs/roadmap.md's enemy-roster pitch) -
 * every bit of its threat is indirect, via the `DriftMine`s it drops.
 * `GameScene` owns targeting (`systems/SaboteurAI.ts`'s
 * `pickDropTarget`) and feeds this class a `target` each frame; this
 * class only owns steering toward whatever it's given, its own carousel
 * count, and drop timing.
 */
export class Saboteur {
  readonly visual: MatterGameObject<Phaser.GameObjects.Graphics>;
  private alive = true;
  private heading: number;
  private minesRemaining: number = SABOTEUR.carouselCount;
  private lastDropAtMs = -Infinity;
  private cachedTarget: Vector2 | undefined;
  private lastRetargetAtMs = -Infinity;

  constructor(scene: Phaser.Scene, position: Vector2, headingRad: number, nowMs: number) {
    this.heading = headingRad;

    const visual = scene.add.graphics();
    scene.matter.add.gameObject(visual, {
      shape: { type: 'circle', radius: SABOTEUR.radius },
      frictionAir: 0,
      friction: 0,
      frictionStatic: 0,
      restitution: 0.2,
      collisionFilter: {
        category: CATEGORY.SABOTEUR,
        mask: CATEGORY.SHIP | CATEGORY.ASTEROID | CATEGORY.PROJECTILE | CATEGORY.COMMANDER,
      },
    });
    this.visual = visual as MatterGameObject<Phaser.GameObjects.Graphics>;
    this.visual.setPosition(position.x, position.y);
    this.visual.setData('entity', this);
    this.visual.setVelocity(Math.cos(headingRad) * SABOTEUR.speed, Math.sin(headingRad) * SABOTEUR.speed);
    this.draw(nowMs);
  }

  get position(): Vector2 {
    return { x: this.visual.x, y: this.visual.y };
  }

  get isAlive(): boolean {
    return this.alive;
  }

  get minesLeft(): number {
    return this.minesRemaining;
  }

  readyToDrop(nowMs: number): boolean {
    return this.minesRemaining > 0 && nowMs - this.lastDropAtMs >= SABOTEUR.dropIntervalMs;
  }

  /** Called by GameScene the instant it actually spawns a DriftMine from this hull - empties one carousel slot. */
  recordDropped(nowMs: number): void {
    this.minesRemaining = Math.max(0, this.minesRemaining - 1);
    this.lastDropAtMs = nowMs;
  }

  /**
   * `resolveTarget` is only actually called once every
   * `SABOTEUR.retargetIntervalMs` - re-running `pickDropTarget` against
   * every asteroid/Commander every single frame would be wasted work
   * and could make it twitch between equally-good targets. Returning
   * `undefined` (nothing worth seeding) just keeps the current heading,
   * same as the Wanderer never steering at all.
   */
  update(
    nowMs: number,
    deltaSeconds: number,
    arenaWidth: number,
    arenaHeight: number,
    resolveTarget: () => Vector2 | undefined,
  ): void {
    if (!this.alive) return;

    if (nowMs - this.lastRetargetAtMs >= SABOTEUR.retargetIntervalMs) {
      this.cachedTarget = resolveTarget();
      this.lastRetargetAtMs = nowMs;
    }
    const target = this.cachedTarget;

    let loitering = false;
    if (target) {
      const dx = target.x - this.position.x;
      const dy = target.y - this.position.y;
      const distance = Math.hypot(dx, dy);
      if (distance > SABOTEUR.loiterDistancePx) {
        const desiredHeading = Math.atan2(dy, dx);
        this.heading = turnToward(this.heading, desiredHeading, SABOTEUR.turnRateRadPerSec, deltaSeconds);
      } else {
        loitering = true;
      }
    }

    const speed = loitering ? 0 : SABOTEUR.speed;
    this.visual.setVelocity(Math.cos(this.heading) * speed, Math.sin(this.heading) * speed);

    const wrapped = wrapPosition(this.position, SABOTEUR.radius, arenaWidth, arenaHeight);
    if (wrapped.x !== this.position.x || wrapped.y !== this.position.y) {
      this.visual.setPosition(wrapped.x, wrapped.y);
    }

    this.draw(nowMs);
  }

  private draw(nowMs: number): void {
    const g = this.visual;
    g.clear();

    const justDropped = nowMs - this.lastDropAtMs < 150;
    const hullFill = justDropped ? 0x2a1414 : METAL_FILL;

    // Slab hull, same chamfered silhouette as the mockup.
    g.lineStyle(1.5, METAL, 1);
    g.fillStyle(hullFill, 1);
    g.beginPath();
    g.moveTo(-20, -8);
    g.lineTo(14, -10);
    g.lineTo(20, -4);
    g.lineTo(20, 4);
    g.lineTo(14, 10);
    g.lineTo(-20, 8);
    g.closePath();
    g.fillPath();
    g.strokePath();
    g.lineStyle(1.5, DANGER, 0.35);
    g.strokePath();

    // Carousel ring - ambient rotation, independent of heading/movement,
    // same as the mockup. `minesRemaining` filled slots, the rest drawn
    // as faint empty outlines.
    const ringRotation = (nowMs / RING_ROTATE_PERIOD_MS) * Math.PI * 2;
    for (let i = 0; i < NODE_COUNT; i += 1) {
      const angle = (i / NODE_COUNT) * Math.PI * 2 + ringRotation;
      const nx = Math.cos(angle) * 15;
      const ny = Math.sin(angle) * 15 * 0.55;
      const filled = i < this.minesRemaining;
      this.drawNode(g, nx, ny, filled, nowMs);
    }
  }

  private drawNode(g: Phaser.GameObjects.Graphics, x: number, y: number, filled: boolean, nowMs: number): void {
    const pulse = 0.5 + Math.sin(nowMs / 500) * 0.5;
    g.lineStyle(1.3, METAL, filled ? 1 : 0.35);
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2;
      g.beginPath();
      g.moveTo(x + Math.cos(a) * 1.8, y + Math.sin(a) * 1.8);
      g.lineTo(x + Math.cos(a) * 4, y + Math.sin(a) * 4);
      g.strokePath();
    }
    g.fillStyle(METAL_FILL, filled ? 1 : 0.25);
    g.fillCircle(x, y, 2.2);
    g.lineStyle(1, METAL, filled ? 1 : 0.35);
    g.strokeCircle(x, y, 2.2);
    if (filled) {
      g.fillStyle(DANGER, 0.5 + pulse * 0.4);
      g.fillCircle(x, y, 1);
    }
  }

  destroy(): void {
    if (!this.alive) return;
    this.alive = false;
    this.visual.destroy();
  }
}
