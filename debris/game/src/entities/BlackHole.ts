import Phaser from 'phaser';
import { BLACK_HOLE, COLORS } from '../config/GameConfig';
import type { Vector2 } from '../utilities/Vector2';

const DISK_RADIUS = BLACK_HOLE.eventHorizonRadius * 1.4;
const DISK_SQUASH = 0.4; // tilted-ellipse flatten factor
const PARTICLE_COUNT = 16;
const GLOW_LAYERS = 4;

interface DiskParticle {
  angle: number;
  radiusFraction: number; // 1 = outer edge of the disk ring, 0 = about to respawn at the outer edge
}

/**
 * "Accretion Disk," decided in docs/art_direction.md - a periodic,
 * fixed-position gravity hazard (Gravity Well, docs/gameplay.md). Not
 * Matter-backed at all (same reasoning as `SpaceStation`): the actual
 * gravity/capture/lethal effects are plain distance checks
 * (`systems/BlackHoleGravity.ts`) GameScene runs against every relevant
 * entity each frame, not a collision body. This class is purely the
 * visual + position - GameScene owns spawn timing, lifespan, and every
 * gameplay decision.
 *
 * The three drawn radii (glow, disk ring, event horizon) are the *exact*
 * `BLACK_HOLE` config values, not independently tuned "looks right"
 * numbers - see the art direction doc's note on why that matters for the
 * event horizon specifically. `glowRadius` is its own visual-only
 * constant, not the (much larger, whole-arena) `gravityRadius` - see
 * that constant's own comment in `GameConfig.ts`.
 */
export class BlackHole {
  readonly visual: Phaser.GameObjects.Graphics;
  readonly position: Vector2;
  private readonly particles: DiskParticle[];
  private alive = true;

  constructor(scene: Phaser.Scene, position: Vector2) {
    this.position = position;
    this.visual = scene.add.graphics();
    this.visual.setPosition(position.x, position.y);
    this.particles = Array.from({ length: PARTICLE_COUNT }, () => ({
      angle: Math.random() * Math.PI * 2,
      radiusFraction: Math.random(),
    }));
    this.draw(0);
  }

  get isAlive(): boolean {
    return this.alive;
  }

  update(nowMs: number, deltaSeconds: number): void {
    if (!this.alive) return;

    for (const particle of this.particles) {
      particle.radiusFraction -= deltaSeconds * 0.25; // ~4s to spiral from the outer edge to center
      if (particle.radiusFraction <= 0) {
        particle.radiusFraction = 1;
        particle.angle = Math.random() * Math.PI * 2;
      }
    }

    this.draw(nowMs);
  }

  private draw(nowMs: number): void {
    const g = this.visual;
    g.clear();

    // Gravity field - layered concentric circles standing in for a
    // radial gradient (Phaser Graphics has no true radial fill), fading
    // from the event horizon out to the gravity radius.
    for (let i = GLOW_LAYERS; i >= 1; i -= 1) {
      const t = i / GLOW_LAYERS;
      const radius = BLACK_HOLE.eventHorizonRadius + (BLACK_HOLE.glowRadius - BLACK_HOLE.eventHorizonRadius) * t;
      g.fillStyle(COLORS.blackHole, 0.05 * (1 - t * 0.6));
      g.fillCircle(0, 0, radius);
    }

    // Tilted, slowly-rotating accretion disk ring.
    g.save();
    g.rotateCanvas(nowMs / 6000);
    g.lineStyle(3, COLORS.blackHole, 1);
    g.strokeEllipse(0, 0, DISK_RADIUS * 2, DISK_RADIUS * 2 * DISK_SQUASH);
    g.restore();

    // Particles spiraling inward along the disk's plane.
    this.particles.forEach((particle) => {
      const radius = DISK_RADIUS * (0.2 + particle.radiusFraction * 0.8);
      const x = Math.cos(particle.angle) * radius;
      const y = Math.sin(particle.angle) * radius * DISK_SQUASH;
      g.fillStyle(COLORS.blackHole, 0.5 + particle.radiusFraction * 0.5);
      g.fillCircle(x, y, 2);
    });

    // Lethal void + event horizon rim (the point of no return - pulses
    // continuously, not just on approach, since it's a boundary, not a
    // one-time warning).
    g.fillStyle(0x000000, 1);
    g.fillCircle(0, 0, BLACK_HOLE.lethalRadius);

    const horizonPulse = 0.7 + 0.3 * Math.sin(nowMs / 450);
    g.lineStyle(2.5, COLORS.ufo, horizonPulse);
    g.strokeCircle(0, 0, BLACK_HOLE.eventHorizonRadius);

    const corePulse = 0.5 + 0.5 * Math.sin(nowMs / 300);
    g.fillStyle(COLORS.ufo, 0.6 + 0.4 * corePulse);
    g.fillCircle(0, 0, BLACK_HOLE.lethalRadius * 0.35 * (0.8 + 0.4 * corePulse));
  }

  destroy(): void {
    if (!this.alive) return;
    this.alive = false;
    this.visual.destroy();
  }
}
