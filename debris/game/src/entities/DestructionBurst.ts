import Phaser from 'phaser';
import type { Vector2 } from '../utilities/Vector2';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spawnedAtMs: number;
}

/**
 * A one-shot burst of small fading dots on destruction (ship, asteroid, or
 * UFO - docs/art_direction.md: "cheap to build, does a lot for game feel").
 * Colored to match what died (decided) - a player's own color for their
 * ship, the neutral asteroid grey, the UFO's red - reusing the existing
 * palette rather than a uniform spark color.
 *
 * A single hand-managed `Graphics` object (clear + redraw every frame),
 * same pattern every other entity in this game already uses, rather than
 * Phaser's `ParticleEmitter` subsystem - keeps this the only kind of
 * GameObject this codebase manages, not a one-off. Not Matter-backed:
 * particles are purely decorative and don't interact with anything, so
 * plain px/sec velocities are used directly (no Matter per-tick unit
 * gotcha to account for - see GameConfig.ts's note on that).
 */
export class DestructionBurst {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly particles: Particle[];
  private readonly color: number;
  private readonly lifespanMs: number;
  private alive = true;

  constructor(
    scene: Phaser.Scene,
    origin: Vector2,
    color: number,
    count: number,
    speedRange: readonly [number, number],
    lifespanMs: number,
    nowMs: number,
  ) {
    this.color = color;
    this.lifespanMs = lifespanMs;
    this.graphics = scene.add.graphics();
    this.particles = Array.from({ length: count }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = speedRange[0] + Math.random() * (speedRange[1] - speedRange[0]);
      return { x: origin.x, y: origin.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, spawnedAtMs: nowMs };
    });
  }

  get isAlive(): boolean {
    return this.alive;
  }

  update(nowMs: number, deltaSeconds: number): void {
    if (!this.alive) return;

    const g = this.graphics;
    g.clear();
    let anyStillAlive = false;
    for (const particle of this.particles) {
      const age = nowMs - particle.spawnedAtMs;
      if (age >= this.lifespanMs) continue;
      anyStillAlive = true;
      particle.x += particle.vx * deltaSeconds;
      particle.y += particle.vy * deltaSeconds;
      g.fillStyle(this.color, 1 - age / this.lifespanMs);
      g.fillCircle(particle.x, particle.y, 2);
    }

    if (!anyStillAlive) this.destroy();
  }

  destroy(): void {
    if (!this.alive) return;
    this.alive = false;
    this.graphics.destroy();
  }
}
