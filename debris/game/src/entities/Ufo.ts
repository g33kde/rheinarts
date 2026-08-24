import Phaser from 'phaser';
import { COLORS, UFO } from '../config/GameConfig';
import { CATEGORY } from '../systems/CollisionCategories';
import { wrapPosition } from '../systems/MovementSystem';
import type { Vector2 } from '../utilities/Vector2';
import type { MatterGameObject } from './MatterGameObject';

const TILT_RAD_AMPLITUDE = 0.12;
const TILT_RAD_PER_SEC = 1.5;
const UNDER_LIGHT_X_OFFSETS = [-0.32, 0, 0.32];
const UNDER_LIGHT_Y_OFFSET = 0.13;
const UNDER_LIGHT_PULSE_PER_SEC = 3;
const DOME_ARC_SEGMENTS = 16;

/**
 * "Classic Saucer," decided in docs/art_direction.md: a wide flattened
 * body ellipse, a dome (only the top half of a smaller ellipse, so it
 * reads as sitting on the body rather than a second full disc), and
 * three under-lights pulsing on independent phases. "No rotation... but
 * the whole silhouette can gently bob/tilt during flight" - implemented
 * as a rotation wobble only, not literal position bobbing: moving the
 * Matter-tracked y position every frame would fight with the body's own
 * physics-driven position, for a subtle effect not worth that risk.
 *
 * Solid (non-sensor) Matter body, same pattern as `Ship` - asteroids and
 * ships should physically nudge it on contact before game logic destroys
 * it, not pass through silently.
 */
export class Ufo {
  readonly visual: MatterGameObject<Phaser.GameObjects.Graphics>;
  private alive = true;
  private elapsedSec = 0;
  private readonly tiltPhaseOffset: number;
  private lastFiredAtMs = -Infinity;

  constructor(scene: Phaser.Scene, x: number, y: number, headingRad: number, rng: () => number = Math.random) {
    this.tiltPhaseOffset = rng() * Math.PI * 2;

    const visual = scene.add.graphics();
    scene.matter.add.gameObject(visual, {
      shape: { type: 'circle', radius: UFO.radius },
      frictionAir: 0,
      friction: 0,
      frictionStatic: 0,
      restitution: 0.2,
      collisionFilter: {
        category: CATEGORY.UFO,
        // COMMANDER: a drifting rescue target is a real hazard target too
        // (docs/gameplay.md's "Emergency Ejection & Rescue"), not just
        // dodgeable countdown fodder.
        mask: CATEGORY.SHIP | CATEGORY.ASTEROID | CATEGORY.PROJECTILE | CATEGORY.COMMANDER,
      },
    });
    this.visual = visual as MatterGameObject<Phaser.GameObjects.Graphics>;
    this.visual.setPosition(x, y);
    this.visual.setData('entity', this);
    this.visual.setVelocity(Math.cos(headingRad) * UFO.speed, Math.sin(headingRad) * UFO.speed);
    this.draw();
  }

  get position(): Vector2 {
    return { x: this.visual.x, y: this.visual.y };
  }

  get isAlive(): boolean {
    return this.alive;
  }

  canFire(nowMs: number): boolean {
    return nowMs - this.lastFiredAtMs >= UFO.fireCooldownMs;
  }

  recordFired(nowMs: number): void {
    this.lastFiredAtMs = nowMs;
  }

  update(deltaSeconds: number, arenaWidth: number, arenaHeight: number): void {
    this.elapsedSec += deltaSeconds;
    const tilt = Math.sin(this.elapsedSec * TILT_RAD_PER_SEC + this.tiltPhaseOffset) * TILT_RAD_AMPLITUDE;
    this.visual.setRotation(tilt);
    this.draw();

    const wrapped = wrapPosition(this.position, UFO.radius, arenaWidth, arenaHeight);
    if (wrapped.x !== this.position.x || wrapped.y !== this.position.y) {
      this.visual.setPosition(wrapped.x, wrapped.y);
    }
  }

  private draw(): void {
    const g = this.visual;
    g.clear();

    const scale = UFO.radius;
    const bodyRx = 0.85 * scale;
    const bodyRy = 0.24 * scale;
    const bodyY = 0.05 * scale;

    g.fillStyle(COLORS.ufoFill, 1);
    g.lineStyle(2, COLORS.ufo, 1);
    g.fillEllipse(0, bodyY, bodyRx * 2, bodyRy * 2);
    g.strokeEllipse(0, bodyY, bodyRx * 2, bodyRy * 2);

    const domeRx = 0.4 * scale;
    const domeRy = 0.3 * scale;
    const domeY = -0.15 * scale;
    g.beginPath();
    for (let i = 0; i <= DOME_ARC_SEGMENTS; i += 1) {
      // t from PI to 2*PI traces left -> top -> right of the ellipse
      // (screen y grows downward), i.e. exactly its top half; closePath()
      // below seals the flat edge back to the start point.
      const t = Math.PI + (i / DOME_ARC_SEGMENTS) * Math.PI;
      const px = domeRx * Math.cos(t);
      const py = domeY + domeRy * Math.sin(t);
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.fillPath();
    g.strokePath();

    UNDER_LIGHT_X_OFFSETS.forEach((nx, i) => {
      const phase = this.elapsedSec * UNDER_LIGHT_PULSE_PER_SEC + i * ((Math.PI * 2) / UNDER_LIGHT_X_OFFSETS.length);
      const brightness = 0.4 + (Math.sin(phase) * 0.5 + 0.5) * 0.6;
      g.fillStyle(COLORS.ufo, brightness);
      g.fillCircle(nx * scale, UNDER_LIGHT_Y_OFFSET * scale, scale * 0.06);
    });
  }

  destroy(): void {
    if (!this.alive) return;
    this.alive = false;
    this.visual.destroy();
  }
}
