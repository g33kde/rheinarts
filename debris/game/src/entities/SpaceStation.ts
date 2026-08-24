import Phaser from 'phaser';
import { COLORS, SPACE_STATION } from '../config/GameConfig';
import type { Vector2 } from '../utilities/Vector2';

const PULSE_PERIOD_MS = 1800;

/**
 * "Cross Dock," decided in docs/art_direction.md - the Cooperative-only
 * rescue drop-off point (docs/gameplay.md's "Emergency Ejection &
 * Rescue"), fixed at arena center for the whole round. Not Matter-backed
 * at all (decided: trigger zone only, no physical collision) - a plain
 * static `Graphics` object; `GameScene` checks a carrying ship's distance
 * against `dropOffRadius` itself
 * (`systems/CommanderRescue.ts`'s `isWithinDropOffRange`), not a
 * collision event, same reasoning Shield/Ship-style Matter sensors
 * weren't needed here.
 */
export class SpaceStation {
  private readonly graphics: Phaser.GameObjects.Graphics;
  readonly position: Vector2;
  readonly dropOffRadius = SPACE_STATION.dropOffRadius;

  constructor(scene: Phaser.Scene, position: Vector2) {
    this.position = position;
    this.graphics = scene.add.graphics();
    this.graphics.setPosition(position.x, position.y);
    this.draw(0);
  }

  update(nowMs: number): void {
    this.draw(nowMs);
  }

  private draw(nowMs: number): void {
    const g = this.graphics;
    const armWidth = SPACE_STATION.armLength * 0.32;
    const armLength = SPACE_STATION.armLength;
    g.clear();

    // Four docking arms, each its own fill+stroke pass (same "one shape,
    // one begin/fill/stroke" pattern every other entity in this game
    // uses, rather than combining rotated rects into a single path).
    for (let i = 0; i < 4; i += 1) {
      g.save();
      g.rotateCanvas((Math.PI / 2) * i);
      g.fillStyle(0x0d0d16, 1);
      g.lineStyle(2.5, COLORS.shield, 1);
      g.beginPath();
      g.moveTo(-armWidth / 2, armWidth);
      g.lineTo(armWidth / 2, armWidth);
      g.lineTo(armWidth / 2, armLength);
      g.lineTo(-armWidth / 2, armLength);
      g.closePath();
      g.fillPath();
      g.strokePath();
      g.restore();
    }

    // Central hub.
    g.fillStyle(0x0d0d16, 1);
    g.lineStyle(2.5, COLORS.shield, 1);
    g.beginPath();
    g.moveTo(-armWidth, -armWidth);
    g.lineTo(armWidth, -armWidth);
    g.lineTo(armWidth, armWidth);
    g.lineTo(-armWidth, armWidth);
    g.closePath();
    g.fillPath();
    g.strokePath();

    // Pulsing center light - "this is a safe, active destination," same
    // pulse-as-signal language Shield's own center light already uses.
    const pulsePhase = (nowMs / PULSE_PERIOD_MS) * Math.PI * 2;
    const pulse = 0.6 + 0.4 * (Math.sin(pulsePhase) * 0.5 + 0.5);
    g.fillStyle(COLORS.shield, 0.6);
    g.fillCircle(0, 0, armWidth * 0.4 * pulse);
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
