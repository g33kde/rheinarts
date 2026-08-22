import Phaser from 'phaser';
import { COLORS, SHIELD } from '../config/GameConfig';
import { CATEGORY } from '../systems/CollisionCategories';
import { wrapPosition } from '../systems/MovementSystem';
import type { Vector2 } from '../utilities/Vector2';
import type { MatterGameObject } from './MatterGameObject';

const SPIN_RAD_PER_SEC = 0.5;
const PULSE_PERIOD_SEC = 2;
const PULSE_MIN_SCALE = 0.12;
const PULSE_MAX_SCALE = 0.18;

/** "Diamond Core," decided in docs/art_direction.md, normalized points. */
const DIAMOND_POINTS: readonly Vector2[] = [
  { x: 0, y: -0.68 },
  { x: 0.46, y: 0 },
  { x: 0, y: 0.68 },
  { x: -0.46, y: 0 },
];

/**
 * Shield power-up pickup: a slowly-rotating sapphire diamond with a
 * pulsing center, drifting in the arena (docs/gameplay.md). Sensor body -
 * `Ship` decides what happens on touch (grant a charge), this entity just
 * exists until picked up or (like everything else) wraps forever.
 */
export class Shield {
  readonly visual: MatterGameObject<Phaser.GameObjects.Graphics>;
  private alive = true;
  private elapsedSec = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, headingRad: number) {
    const visual = scene.add.graphics();
    scene.matter.add.gameObject(visual, {
      shape: { type: 'circle', radius: SHIELD.radius },
      isSensor: true,
      frictionAir: 0,
      collisionFilter: { category: CATEGORY.PICKUP, mask: CATEGORY.SHIP },
    });
    this.visual = visual as MatterGameObject<Phaser.GameObjects.Graphics>;
    this.visual.setPosition(x, y);
    this.visual.setData('entity', this);
    this.visual.setVelocity(Math.cos(headingRad) * SHIELD.speed, Math.sin(headingRad) * SHIELD.speed);
    this.draw();
  }

  get position(): Vector2 {
    return { x: this.visual.x, y: this.visual.y };
  }

  get isAlive(): boolean {
    return this.alive;
  }

  update(deltaSeconds: number, arenaWidth: number, arenaHeight: number): void {
    this.elapsedSec += deltaSeconds;
    this.visual.setRotation(this.visual.rotation + SPIN_RAD_PER_SEC * deltaSeconds);
    this.draw();

    const wrapped = wrapPosition(this.position, SHIELD.radius, arenaWidth, arenaHeight);
    if (wrapped.x !== this.position.x || wrapped.y !== this.position.y) {
      this.visual.setPosition(wrapped.x, wrapped.y);
    }
  }

  private draw(): void {
    const g = this.visual;
    g.clear();
    g.fillStyle(0x0d0d16, 1);
    g.lineStyle(2, COLORS.shield, 1);
    g.beginPath();
    DIAMOND_POINTS.forEach((p, i) => {
      const px = p.x * SHIELD.radius;
      const py = p.y * SHIELD.radius;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    });
    g.closePath();
    g.fillPath();
    g.strokePath();

    const pulsePhase = (this.elapsedSec / PULSE_PERIOD_SEC) * Math.PI * 2;
    const pulseScale = PULSE_MIN_SCALE + (Math.sin(pulsePhase) * 0.5 + 0.5) * (PULSE_MAX_SCALE - PULSE_MIN_SCALE);
    g.fillStyle(COLORS.shield, 1);
    g.fillCircle(0, 0, pulseScale * SHIELD.radius);
  }

  destroy(): void {
    if (!this.alive) return;
    this.alive = false;
    this.visual.destroy();
  }
}
