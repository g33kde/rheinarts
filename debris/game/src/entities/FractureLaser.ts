import Phaser from 'phaser';
import { COLORS, FRACTURE } from '../config/GameConfig';
import { fromAngle, type Vector2 } from '../utilities/Vector2';

type LaserPhase = 'telegraph' | 'active' | 'fading' | 'done';

/**
 * The Core's laser (docs/roadmap.md's Phase 1) - a long, thin, one-shot
 * hazard, unlike everything else in this game. Not Matter-backed at all:
 * hit-testing is `systems/BeamGeometry.ts`'s pure point-to-segment
 * distance check, run by GameScene each frame against every ship while
 * this laser reports `isActive()`, same "plain math hazard" pattern the
 * Black Hole already established for something that isn't a normal
 * circle-vs-circle collision.
 *
 * Self-managing lifespan (telegraph -> active -> fading -> gone), same
 * shape as `DestructionBurst` - it destroys itself once its own timeline
 * finishes rather than GameScene tracking a separate timer for it.
 */
export class FractureLaser {
  readonly origin: Vector2;
  readonly angleRad: number;
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly spawnedAtMs: number;
  private alive = true;

  constructor(scene: Phaser.Scene, origin: Vector2, angleRad: number, nowMs: number) {
    this.origin = origin;
    this.angleRad = angleRad;
    this.spawnedAtMs = nowMs;
    this.graphics = scene.add.graphics();
    this.draw(nowMs);
  }

  get isAlive(): boolean {
    return this.alive;
  }

  isActive(nowMs: number): boolean {
    return this.phaseAt(nowMs) === 'active';
  }

  update(nowMs: number): void {
    if (!this.alive) return;
    if (this.phaseAt(nowMs) === 'done') {
      this.destroy();
      return;
    }
    this.draw(nowMs);
  }

  private phaseAt(nowMs: number): LaserPhase {
    const elapsed = nowMs - this.spawnedAtMs;
    if (elapsed < FRACTURE.laserTelegraphMs) return 'telegraph';
    if (elapsed < FRACTURE.laserTelegraphMs + FRACTURE.laserActiveMs) return 'active';
    if (elapsed < FRACTURE.laserTelegraphMs + FRACTURE.laserActiveMs + FRACTURE.laserFadeMs) return 'fading';
    return 'done';
  }

  private draw(nowMs: number): void {
    const g = this.graphics;
    g.clear();

    const direction = fromAngle(this.angleRad);
    const end = { x: direction.x * FRACTURE.laserLength, y: direction.y * FRACTURE.laserLength };
    const phase = this.phaseAt(nowMs);

    g.setPosition(this.origin.x, this.origin.y);

    if (phase === 'telegraph') {
      const t = (nowMs - this.spawnedAtMs) / FRACTURE.laserTelegraphMs;
      g.lineStyle(1.5, COLORS.ufo, 0.25 + 0.35 * t);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(end.x, end.y);
      g.strokePath();
      return;
    }

    if (phase === 'active') {
      g.lineStyle(FRACTURE.laserWidth, COLORS.ufo, 0.95);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(end.x, end.y);
      g.strokePath();
      // bright core stripe down the middle, same "thin glowing outline over filled shape" spirit as the rest of the game's vector style
      g.lineStyle(Math.max(2, FRACTURE.laserWidth * 0.35), 0xffffff, 0.85);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(end.x, end.y);
      g.strokePath();
      return;
    }

    // fading
    const fadeT = (nowMs - this.spawnedAtMs - FRACTURE.laserTelegraphMs - FRACTURE.laserActiveMs) / FRACTURE.laserFadeMs;
    g.lineStyle(FRACTURE.laserWidth, COLORS.ufo, 0.9 * (1 - fadeT));
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(end.x, end.y);
    g.strokePath();
  }

  destroy(): void {
    if (!this.alive) return;
    this.alive = false;
    this.graphics.destroy();
  }
}
